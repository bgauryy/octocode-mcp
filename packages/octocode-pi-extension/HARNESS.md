# `@octocodeai/pi-extension` — Full Harness Reference

Everything the extension registers with Pi on load: tools, system-prompt sections, MCP, subagents, skills, slash commands, flags, lifecycle hooks, and UI surfaces.

---

## System Prompt

The first-turn prompt is assembled from a small Pi host adapter, the canonical coder kernel from `@octocodeai/agent-contracts/prompts`, and the canonical `EXTERNAL_AGENT_AWARENESS_PROMPT`. The kernel owns intent classification, execution and delegation, verification, continuation, repository/tool routing, lifecycle, and output rules. Full Awareness recipes remain on demand through `guide` and the skill. The built prompt is supplied through `before_agent_start`; no regex-triggered repo-state, output-recovery, or editor-comment prompts are injected.

On the first main-agent turn, the hook freezes seven stable system segments:
product policy, MCP catalog, runtime capabilities, dynamic tool contracts, available
skills, session artifact contract and `awareness-cli-runtime`. The last segment
binds the canonical guide to the installed CLI and current store/workspace/identity.
The active plan remains separate attributed turn context. Runtime plan/tool results
remain in the transcript; compaction adds a bounded recovery marker. With
`--no-context` set, the hook suppresses project context before freezing the prompt.

---

## Tools

### Native Research Tools — 0 (removed — MCP-only)

All 10 catalogued Octocode research tools (GitHub, local, graph, LSP, npm) are **not registered as native Pi tools**. They are served via the built-in `octocode` MCP server through `MCPTool`, keeping their schemas out of Pi’s direct `tools[]` array.

**Call pattern:**
```js
MCPTool({queries:[{reasoning:"Search remote code.", action:"call", server:"octocode", tool:"ghSearch",
  arguments:{queries:[{reasoning:"Find candidate files.", operation:"code", keywords:["..."]}]}}]})
```

Catalogued tools via `MCPTool server:"octocode"`: `ghSearch` · `ghGetFileContent` · `ghSearchHistory` · `ghGetHistoryItem` · `ghCloneRepo` · `npmSearch` · `localSearch` · `localGetFileContent` · `localAnalyzeGraph` · `lspGetSemantics`. Runtime availability can disable individual tools such as cloning.

`warmMcpCatalog()` runs at `session_start`. The default first-turn prompt consumes the concise deterministic `mcp.md` guide while exact schemas stay private for validation. Set `OCTOCODE_COMPACT_MCP=0` only to inject the exact catalog for debugging; set `OCTOCODE_MCP_AI_GUIDE=1` to opt into model-authored guide generation. Calls always validate against the exact private catalog; use `MCPTool action:"describe"` before calling an unfamiliar tool or whenever the compact guide leaves an operation ambiguous.

**Edit stale-check**: `MCPTool` intercepts `server:"octocode" tool:"localGetFileContent"` calls and runs `recordFileReadState()` so `file` operations with `type:"edit"` can detect stale targets.

### Support Tools — 14

Registered from extension sources and named in `OCTOCODE_SUPPORT_TOOL_NAMES`: `file`, `web`, `chromeDebug`, `agent`, `callTool`, `skill`, `plan`, `localServer`, `awareness`, `MCPTool`, `askUser`, `inspectMedia`, `media`, and `runFfmpeg`. Together with the guarded `bash` override, these form the 15-tool direct palette. Every direct tool exposes only a top-level `queries[]` array; each query requires concise `reasoning`. `/configuration` is the local management page, not a model-callable support-tool alias.

| Tool | Label | Description |
|---|---|---|
| `file` | File | Create, edit, or delete files through one guarded and fully preflighted mutation boundary |
| `web` | Web | Fetch an absolute URL or run a web search |
| `chromeDebug` | Chrome DevTools | Run direct, stateful CDP operations for DOM, network, console, evaluation, navigation, and screenshots |
| `agent` | Agent | Spawn and manage researcher, planner, architect, implementer, browser, and explicit custom worker profiles |
| `callTool` | Call Tool | Invoke a registered dynamic-capability tool from the live `<dynamic_capabilities>` registry |
| `skill` | Skill | Load installed skills or manage dynamic skill workflows with `type:"call"` |
| `plan` | Plan | Own session/shared plans, stable task projection, and observed check receipts |
| `localServer` | Local Server | Serve an inspected local static directory over loopback for user review |
| `awareness` | Awareness | List, describe, and execute canonical Awareness commands with host-injected identity and storage bindings |
| `MCPTool` | MCPTool | Call automatically discovered tools, describe one selected tool, and manage configured MCP servers |
| `askUser` | Ask User | Ask the user through an interactive picker, form, or non-TUI fallback |
| `inspectMedia` | Inspect Media | Perceive images, video frames/contact sheets, and audio metadata/visualizations |
| `media` | Media | Author images/PDFs or transform media into path-guarded output files |
| `runFfmpeg` | Run FFmpeg | Run advanced ffmpeg/ffprobe argv with path guards, timeout, cancellation, and progress |

### Guarded Built-in Overrides — 1

Same-name `registerTool` overrides. Pi keeps the tool name; the extension owns the implementation. Named in `OVERRIDDEN_BUILTIN_TOOL_NAMES`.

| Tool | What the override adds |
|---|---|
| `bash` | Catastrophic pattern block (`rm -rf /`, `mkfs`, `dd of=/dev/`, `shutdown/reboot/halt`) · best-effort write-target extraction for redirects / `tee` / `cp`/`mv`/`install` → path guard · process output streamed to a private ephemeral log · at most approximately 4,000 model-visible head-and-tail characters plus a chunk-read reference · bounded UI reads · timeout support |

### Disabled Built-ins — 6

The branded launcher suppresses every native Pi built-in before session creation
(`noTools:"builtin"` in the SDK path, `--no-builtin-tools` in the subprocess path). For hosts
that load the extension directly, these six names are also removed from `activeTools` on load
and on `session_start`. Named in `DISABLED_BUILTIN_TOOL_NAMES`.

| Removed | Replaced by |
|---|---|
| `read` | `localGetFileContent` (records read state for `file` edit stale-check) |
| `edit` | `file` with `type:"edit"` |
| `write` | `file` with `type:"write"` |
| `grep` | `localSearch` with `operation:"text"` |
| `find` | `localSearch` with `operation:"files"` |
| `ls` | `localSearch` with `operation:"tree"` |

---

## MCP

### Built-in Octocode server

Auto-configured — no user action required.

| Field | Value |
|---|---|
| Server name | `octocode` |
| Command | Pinned local `octocode-mcp` through Node; fallback `npx -y octocode-mcp@latest` |
| NPX cache | `$OCTOCODE_HOME/extension/cache/mcp-npx` for the fallback (no `--prefer-online`) |
| Timeout | 30 s |
| Connection | **Pre-warmed at `session_start`** via `warmMcpCatalog()`; catalog injected into system prompt before turn 1 |

### User-defined servers

The harness merges active files from lowest to highest precedence. A later entry with the same server name wins.

| Precedence | Scope | Path |
|---|---|---|
| 1 | Built-in | pinned-local-first `octocode` server |
| 2 | Global | `$OCTOCODE_HOME/extension/mcp/servers.json` |
| 3 | Workspace | `$OCTOCODE_HOME/extension/workspaces/<workspace-key>/mcp/servers.json` |

Project files load only after workspace trust. `MCPTool` `action:"add"|"remove"` manages the canonical files; direct edits hot-refresh connections and artifacts, while `/new` refreshes the frozen agent prompt.

Format: `{ "mcpServers": { "<name>": { "command": "...", "args": [], "env": {}, "cwd": "...", "disabled": false, "timeoutMs": 30000 } } }`. See [`docs/TOOLS.md`](docs/TOOLS.md#mcp-servers) for the complete setup, precedence, and security contract.

### Settings and MCP slash commands

`/configuration` rebuilds local `settings.html` from Pi's live public command registry and opens the overview. The page contains skills, MCP connections/tools, enablement overrides, display controls, and prompt-state information. Section links navigate within the page. See [docs/SETTINGS.md](docs/SETTINGS.md) for persistence, security, and refresh behavior.

---

## Bundled Skills

Served via the `resources_discover` hook and installed at `dist/skills/`. Canonical
discovery in `src/tools/skill-discovery.ts` merges enabled skills from Pi metadata,
supported platform roots, Octocode roots, and this bundled directory. The bundled
`octocode-awareness` skill is loadable and owns detailed operating guidance. See the
[15-skill inventory](README.md#bundled-skills-15) for the complete enabled bundle.

| Skill | Source |
|---|---|
| `octocode-awareness` | Canonical `@octocodeai/octocode-awareness` package skill |
| Other bundled skills | Build-managed sources; see the README inventory |

Env var `OCTOCODE_SKILL_ROOT` is set to the skill root so bundled skills can locate their assets.

---

## Subagents

Spawn workers with an `agent` query whose `type` is `spawn` and whose `profile` selects the runtime. Typed profiles use standalone prompts in `subagents/<name>/SYSTEM_PROMPT.md` and curated least-capability toolsets. Every spawn requires goal, context, scope, ownership, acceptance, and returnShape; incomplete packets fail before process creation.

| Profile | Specialty | Tools |
|---|---|---|
| `researcher` | Evidence gathering and compact claim ledgers | `web` · `MCPTool` · `file` · `skill` · `bash` (Awareness CLI only) |
| `architect` | Root-cause analysis and code archaeology | `web` · `MCPTool` · `file` · `skill` · `bash` (Awareness CLI and bounded test/build/debug checks) |
| `planner` | Dependency-ordered implementation plans and test strategy | `web` · `MCPTool` · `file` · `skill` · `bash` (Awareness CLI only) |
| `implementer` | One bounded implementation unit with exclusive ownership and an observed check | `MCPTool` · `file` · `skill` · `bash` |
| `browser` | Multi-turn browser analysis and lifecycle management | `chromeDebug` · `MCPTool` · `skill` · `bash` |
| `custom` | Caller-defined bounded role | Explicit caller-provided `tools` allowlist and non-empty `systemPrompt` |

Researcher, architect, and planner workers keep product-code investigation read-only. Their `file` capability
is limited by role policy to parent-assigned RFC or durable handback artifacts;
it does not authorize product edits. `skill` loads operating guidance. Every typed
worker can use the supplied Awareness CLI for scoped communication and bookkeeping;
`bash` does not replace MCP research. Architect additionally permits bounded
non-destructive test, build and debug checks. Typed profiles use the current
`file` and `skill` names rather than removed standalone memory/write wrappers.
Browser workers load the Octocode extension, enabled skills, and Awareness bindings. Custom workers receive the shared bounded-worker contract before their required caller role prompt. Explicit `tools:[]` maps to `--no-tools`; explicit lean mode disables extension and skill loading for isolated tool-less workers.

---

## Slash Commands

Registered via `pi.registerCommand`:

| Command | Description |
|---|---|
| `/octocode-rewind` | Select bounded local history, preview file changes, and explicitly apply the reviewed preview. |
| `/octocode-inbox` | Pick a spawned worker, then view its transcript, steer it, stop it, or dismiss the overlay. |
| `/configuration` | Open the local browser configuration page from its overview. |

The footer displays the same entry. Configuration includes MCP, skills, display,
effort, permission controls, and an explicit Review plan action. Browser plan
Start and Request changes use typed HTTP actions; feedback remains plain user text.
Other workflow actions remain in tools or the live Awareness CLI.

---

## Flags

Registered via `pi.registerFlag`.

| Flag | Type | Default | Effect |
|---|---|---|---|
| `--no-context` | boolean | `false` | Suppress project context files from the system prompt for this run |

---

## Lifecycle Hooks

Registered via `createHookComposer(pi, …)` (middleware composer that catches and reports errors).

| Event | Middleware ID | What it does |
|---|---|---|
| `resources_discover` | `bundled-skills` | Returns `{ skillPaths: [dist/skills/] }` so Pi discovers bundled skills |
| `session_start` | `octocode-session-start` | Resets metrics state, applies Octocode UI, starts cron scheduler, reasserts the native-tool replacement set for direct hosts, loads `.env` via `propagateOctocodeEnv` (global + project, trust-gated), notifies on env changes |
| `session_shutdown` | `octocode-session-shutdown` | Stops cron scheduler, kills spawned agents, stops MCP servers, clears all status labels and widgets |
| `model_select` | `octocode-model-select` | Logs model selection; updates UI thinking-level label |
| `thinking_level_select` | `octocode-thinking-select` | Logs thinking level; refreshes UI label |
| `input` | `octocode-session-autoname` | Names the session from the first substantive user message |
| `tool_execution_start` | `octocode-tool-error-timing` | Records tool call start time for latency tracking |
| `tool_execution_end` | `octocode-tool-error-log` | On tool error, logs structured error with latency; notifies UI |
| `before_provider_request` | `octocode-provider-error-timing` | Records provider request start time |
| `after_provider_response` | `octocode-provider-error-log` | On non-2xx status, logs provider error with latency + headers |
| `before_agent_start` | `octocode-system-prompt` | Builds the complete prompt/catalog once, then reuses byte-identical system-prompt content for the session |

### Direct `pi.on` handlers

| Event | Effect |
|---|---|
| `turn_start` | Sets `activeTurnStartedAt`, refreshes metrics UI |
| `turn_end` | Records `lastTurnMs`, increments `completedTurns`, clears active-turn marker |
| `session_shutdown` (compaction) | Clears registered context-source snapshots without reading a stale replacement context |
| `session_before_compact` | Deterministic split-turn checkpoint on the overflow path only |
| `session_compact` | Clears read state, persists a best-effort checkpoint and rehydration ledger, then emits one checkpoint card; Pi owns continuation |

### Awareness

The harness imports `@octocodeai/octocode-awareness` for native registry membership,
shared plan projection, mutation guards/presence and peer-event delivery/policy.
Model-facing signals, explicit locks, memory, verification, history, bookkeeping,
and maintenance use the single `awareness` list/describe/call facade. Commands labeled
`external-host-only` retain the installed CLI fallback through guarded `bash`. Pi freezes
seven stable system segments, including `awareness-cli-runtime`, which supplies routing,
the fallback runner, physical SQLite path, normalized workspace, and stable identity.
External CLI agents communicate through that same database/workspace with their own
distinct IDs. Native run/task IDs and receipts are reused. Pi does not install shell
hooks; its native events remain the lifecycle owner. See [agent flow](docs/AWARENESS_AGENT_FLOW.md).

Each Pi session also writes one version 2 contract across `manifest.json`, `session.json`, `plan/index.json`, `tasks/index.json`, and `backlog/index.json`, plus `memory.md` and `audit.md`, under the safe flat session root. These files expose stable session/plan/task/backlog IDs for inspection and handoff; they are projections, not a second coordination database. With `storage.mode=memory`, filesystem projections remain available, durable CLI bindings are omitted and the prompt directs agents to session state.

---

## UI Status Surfaces

Set via `ctx.ui.setStatus(name, value)` and `ctx.ui.setWidget(name, value)`.

| Status key | Content |
|---|---|
| `octocode` | Working message (tool name or thinking indicator) |
| `octocode-thinking` | Current thinking level badge |
| `octocode-agents` | Spawned worker count and states badge |
| `octocode-plan` | Active plan badge |
| `agent-wait` | "waiting for agent \<id\>" label during an `agent` `type:"wait"` query |
| `chrome-debug` | Active CDP action label during `chromeDebug` calls |
| `octocode-mcp` | MCP connection status label |

Metrics (turns · durations · exact current/max context), plan/task progress, Awareness attention, and a bounded live-agent list live only on the consolidated footer (`setFooter`), never in a duplicate status line or below-editor widget. The identity row contains `/configuration` (opens the settings HTML page in the browser); keyboard hints are intentionally omitted. A once-per-session, non-blocking `npx octocode auth status --json` probe adds `github ✓` in green when authenticated, `github ✗ login required` in red when credentials are missing, or `github check failed` in red on probe errors. Log in with `npx octocode auth login`. Full worker details remain available through the `agent` tool.

---

## Environment Variables

Set by the harness at load time.

| Variable | Value |
|---|---|
| `OCTOCODE_AWARENESS_CLI` | Installed Awareness CLI path used by the native runner and guarded `bash` fallback |
| `OCTOCODE_NODE` | Node executable for the installed CLI |
| `OCTOCODE_AWARENESS_DB` | Native Pi Awareness database forwarded to the runner and guarded `bash` |
| `OCTOCODE_AWARENESS_WORKSPACE` | Normalized workspace forwarded to the runner and guarded `bash` |
| `OCTOCODE_AGENT_ID` | Current participant identity forwarded to the runner and guarded `bash` |
| `OCTOCODE_SKILL_ROOT` | Absolute path to `dist/skills/` |

Read from env at runtime (not set by harness):

| Variable | Purpose |
|---|---|
| `OCTOCODE_HOME` | Octocode home directory (default: `~/.octocode`) |
| `ALLOWED_PATHS` | Colon/comma-separated extra roots for path-guard (`file`/`bash`) |
| `OCTOCODE_AGENT_MAX_ACTIVE` | Cap on concurrent spawned workers |
| `ENABLE_CLONE` | Enables `ghCloneRepo` tool |
| `ENABLE_LOCAL` | Set `false` to disable all `local*` tools |
| `OCTOCODE_EDIT_NATIVE_DIFF` | Set `1` to use native Rust diff engine for large files |

---

## Conformance Testing Entrypoint

Production Pi SDK probes are test-only and do not load with the runtime extension:

```ts
import {
  createProductionPiScenarioSuite,
  captureProductionPiLifecycle,
} from '@octocodeai/pi-extension/testing';
```

The default `@octocodeai/pi-extension` entrypoint exports only runtime composition and must not statically reach `src/adapters/pi-production-probe.ts`.

---

## Asset Paths

Resolved by `getAssetPaths()` in `src/assets.ts`.

| Asset | Path |
|---|---|
| System prompt | `dist/system/SYSTEM_PROMPT.md` |
| Shared Awareness runtime | Installed `@octocodeai/octocode-awareness`; native lifecycle imports and the `awareness` facade share its ledger; the CLI remains the external-host fallback |
| Skills dir | `dist/skills/` |
| APPEND_SYSTEM template | `dist/system/APPEND_SYSTEM.md` |

---

## Counts at a Glance

```
 0  native research tools    (removed — served via MCPTool → octocode MCP server)
14  support tools            (see Support Tools table)
 1  guarded built-in override (bash)
 6  disabled built-ins       (read, edit, write, grep, find, ls → replaced)
3  slash commands           (local recovery, worker inbox, and configuration)
 1  flag                     (--no-context)
12  lifecycle hooks          (hookComposer; session_start pre-warms MCP catalog)
    direct pi.on handlers    (metrics, UI, worker inbox, Awareness, and Pi-owned compaction observation)
15  bundled skills           (including the canonical octocode-awareness skill)
 6  worker profiles          (researcher, architect, planner, implementer, browser, custom)
 1  built-in MCP server      (octocode — cache-first npx, pre-warmed at session start)
 1  composed system prompt     (host facts + canonical coder kernel + Awareness guide + runtime bindings)
```

## Token Savings

| | Per-turn `tools[]` definitions |
|---|---|
| Before | 13 native tool schemas — not prompt-cached, paid every turn |
| After | 1 (`MCPTool`) — catalog lives in `<mcp_cached_catalog>` in system prompt (prompt-cached, paid once) |

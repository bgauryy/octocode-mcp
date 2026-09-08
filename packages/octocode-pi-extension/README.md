# `@octocodeai/pi-extension`

The official Octocode package for Pi. It combines Octocode research through MCP with guarded file and shell operations, subagents, skills, media workflows, planning, and a live settings interface.

The Pi host SDK (`@earendil-works/pi-coding-agent` 0.84.4) is a required peer dependency because the extension imports its runtime APIs.

## Install

Requires Node.js 22.22.2+ (22.x), 24.15.0+ (24.x), or 26+.

```bash
pi install npm:@octocodeai/pi-extension
```

The package registers its extension and themes through Pi's package manifest. Octocode's built-in MCP server is configured automatically, preferring the package-local server and falling back to `npx -y octocode-mcp@latest`.

## Runtime surface

The live source inventory is authoritative. Use `/configuration` inside Pi and see [HARNESS.md](HARNESS.md) for the detailed contract.

| Surface | Count |
|---|---:|
| Native Octocode research tools | 0 (research is served through `MCPTool`) |
| Pi support tools | 14 |
| Guarded Pi builtin overrides | 1 (`bash`) |
| Disabled Pi builtins | 6 |
| Slash command entries | 3 |
| Bundled main-agent skills | 15 |

### Support tools

| Tool | Purpose |
|---|---|
| `file` | Create, edit, or delete files through one guarded mutation boundary. |
| `web` | Fetch an absolute URL or search the web. |
| `chromeDebug` | Inspect and control Chrome through CDP. |
| `agent` | Spawn and manage researcher, architect, planner, implementer, browser, and explicit custom workers. |
| `callTool` | Invoke a capability from the live dynamic-tool registry. |
| `skill` | Load and manage installed skills. |
| `plan` | Manage session and shared plans with verification receipts. |
| `localServer` | Serve an inspected local directory on loopback for review. |
| `awareness` | Discover, describe, and invoke the canonical Awareness command runtime without shell syntax. |
| `MCPTool` | Discover, describe, call, and manage MCP tools and servers. |
| `askUser` | Request structured input through Pi's UI. |
| `inspectMedia` | Inspect images, video, and audio. |
| `media` | Create or transform media and PDFs. |
| `runFfmpeg` | Run guarded ffmpeg or ffprobe argument lists. |

The extension overrides `bash` with command and path guards. It removes Pi's public `read`, `edit`, `write`, `grep`, `find`, and `ls` tools; use Octocode research tools for reads and discovery, and `file` for mutations.

Awareness coordination uses the native `awareness` facade for catalog discovery and
host-bound command calls without shell syntax. The bundled skill provides workflow guidance,
and the installed CLI remains the explicit fallback for external-host-only operations. Pi
supplies the runner, database, workspace and agent identity. Signals,
locks, memory, bookkeeping and maintenance share the same SQLite ledger as native
Pi events and external CLI agents. Pi retains automatic registry/event delivery,
mutation guards and plan UI. Peers must use the same physical database and workspace
with distinct stable IDs. See [Awareness agent flow](docs/AWARENESS_AGENT_FLOW.md).

Awareness also records bounded local file history around native `file` mutations with bundled private Git storage. `/octocode-rewind` previews and explicitly applies a selected file restore in interactive Pi; headless sessions use the same `history` commands through the native `awareness` facade, with the bundled CLI retained for external-host fallback. This does not snapshot the workspace on every prompt or rewind the conversation.

Typed and browser workers receive explicit Octocode research, skill, and Awareness capabilities. Custom workers require an explicit least-capability tool allowlist and a non-empty role prompt; all workers receive the shared bounded-worker contract.

## Configuration and privacy

Octocode configuration is shared by the CLI, MCP server, and this extension. Resolution order is:

```text
environment variables > <octocode-home>/.octocoderc > built-in defaults
```

Existing `.octocoderc` files remain valid. The optional storage setting is backward-compatible; omitting it keeps persistent behavior.

```json
{
  "version": 1,
  "storage": {
    "mode": "memory"
  }
}
```

Set `OCTOCODE_HOME` to change the Octocode home directory. Set `OCTOCODE_STORAGE_MODE=memory` for an environment override. In memory mode, Octocode disables response-disk caching, clone and exact-file materialization, session/stat persistence, and the extension's SQLite-backed Awareness state. The extension keeps active interaction and authorization state in process memory until exit. It does not delete existing files or disable user-authored configuration and credentials. Invalid environment values do not weaken a valid `.octocoderc` memory setting.

See the repository [configuration guide](https://github.com/bgauryy/octocode/blob/main/docs/CONFIGURATION.md) for every supported key and [docs/SETTINGS.md](docs/SETTINGS.md) for Pi's control center, persistence, and security behavior.

## Slash command entries (3)

| Command | Purpose |
|---|---|
| `/octocode-rewind` | Preview and explicitly apply a local file-history restore. |
| `/octocode-inbox` | Inspect, steer, or stop spawned workers through a keyboard-driven picker. |
| `/configuration` | Open the local browser configuration page. |

The footer shows `/configuration`. The page controls MCP connections and tools,
skills, permissions, theme, effort, and footer density, and opens the current plan
for review. Host-provided and user-installed commands remain in the live inventory.
The recovery command remains preview-first and does not rewrite input through regex triggers.

## Bundled skills (15)

The build copies these main-agent skills into `dist/skills/`:

- `octocode-architect`
- `octocode-awareness`
- `octocode-brainstorming`
- `octocode-chrome-devtools`
- `octocode-clean-code`
- `octocode-code-graph`
- `octocode-documentation`
- `octocode-eval-benchmark`
- `octocode-prompt-optimizer`
- `octocode-research`
- `octocode-rfc-generator`
- `octocode-roast`
- `octocode-scraping`
- `octocode-skills`
- `octocode-subagent`

## Documentation

- [HARNESS.md](HARNESS.md): full registered surface and lifecycle
- [docs/TOOLS.md](docs/TOOLS.md): tool routing and MCP usage
- [docs/SETTINGS.md](docs/SETTINGS.md): settings, persistence, and security
- [docs/SUBAGENTS.md](docs/SUBAGENTS.md): worker profiles and coordination
- [docs/MEDIA_TOOL.md](docs/MEDIA_TOOL.md): media routing
- [docs/FFMPEG.md](docs/FFMPEG.md): ffmpeg and ffprobe workflows
- [docs/README.md](docs/README.md): complete package documentation index

## Development

From the monorepo root:

```bash
yarn workspace @octocodeai/pi-extension build
yarn workspace @octocodeai/pi-extension test
yarn workspace @octocodeai/pi-extension typecheck
```

The package's production test suite checks the documented inventories against the executable harness so counts and names cannot drift silently. Cross-host conformance code imports `createProductionPiScenarioSuite` and `captureProductionPiLifecycle` from `@octocodeai/pi-extension/testing`; the runtime root intentionally exports neither helper.

Awareness uses one compact cooperation policy with full CLI/skill detail on demand. See [agent flow](docs/AWARENESS_AGENT_FLOW.md#final-worker-audits-and-context-estimates) for bounded wake-ups, final worker debt audits and context-estimate limits.

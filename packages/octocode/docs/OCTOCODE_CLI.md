# Octocode CLI

`npx octocode` runs every Octocode research tool from a terminal, under the same
tool names, query contracts, security policy and native runtime as the MCP
server. There are no per-tool flags or aliases: a command is a tool name plus
one JSON query. The npm launcher forwards every command to the native CLI,
including help, version, installation, skills, and `config view`.

```text
npx octocode <toolName> '<json>'   ──► native Rust runtime ──► GitHub, local, packages, LSP
octocode-mcp tool call             ──► native Rust runtime ──► (same tools, same contracts)
```

Tool fields, defaults and results: [tools reference](https://github.com/bgauryy/octocode/blob/main/docs/OCTOCODE_TOOLS.md).
Which tool to call when: [workflows](https://github.com/bgauryy/octocode/blob/main/docs/OCTOCODE_WORKFLOWS.md).
Settings: [configuration](https://github.com/bgauryy/octocode/blob/main/docs/CONFIGURATION.md).

## Commands

### Tools

| Command | Purpose |
|---|---|
| `localSearch` | Literal or regex matches in local files. |
| `localFetch` | Read a known local file or an exact source region. |
| `structureSearch` | Outline directories, or find files by name or metadata. |
| `astSearch` | Declarations, syntax trees, or structural (ast-grep) matches. |
| `lspSearch` | Callers, references, same-name symbols, types, or diagnostics. |
| `ghSearchRepo` | Discover GitHub repositories by keywords, owner, or filters. |
| `ghSearchCode` | Default-branch code or file paths in a GitHub owner or repo. |
| `ghStructure` | A GitHub repository's tree, refs, or languages. |
| `ghGetFileContent` | Read a known GitHub file or exact source region. |
| `ghSearchHistory` | Find pull requests, issues, or commits. |
| `ghGetHistoryItem` | Read one pull request, issue, commit, or comparison. |
| `ghCloneRepo` | Cache a shallow GitHub checkout for local analysis (CLI only; needs persistent storage). |
| `artifactSearch` | Package versions, dependencies, or upstream release source. |
| `astTopology` | Beta, CLI only: dependency and reachability topology. |
| `clasify` | Beta: typed answers about unread text, images, or held data. Also needs `OCTOCODE_CLASSIFICATION_API` ([clasify](https://github.com/bgauryy/octocode/blob/main/docs/OCTOCODE_CLASIFY.md)). |

Beta means `OCTOCODE_BETA=true` (or `local.beta: true`). `astRewrite` is parked
in this build: no surface lists or runs it, with or without beta.

### System

| Command | Purpose |
|---|---|
| `schema [tool]` | No name: the enabled tools with fields and agent instructions. With a name: that tool's input contract and `availability`. See [Schema discovery](#schema-discovery). |
| `config` | Config and `.env` paths, loaded key names, and config warnings. Subcommands: `home`, `get`, `set`, `unset`, `check`, `view`. See [`config`](#config--settings-and-keys). |
| `auth` | GitHub sign-in: `status`, `login`, `logout`. See [`auth`](#auth--github-authentication). |
| `install` | Add the MCP server to an agent client. See [`install`](#install--mcp-client-setup). |
| `skill` | Install, check, or remove bundled Agent Skills. See [`skill`](#skill--agent-skills). |
| `graph` | Build and query a persisted code graph. See [`graph`](#graph--persisted-code-graph). |
| `help` | Help for any command. |

Hidden maintenance commands: `cache status|clear` (cache directory, recent
evictions; `clear` deletes cached GitHub and registry responses) and
`lsp-server list|install|uninstall|clean|status` (see [`lsp-server`](#lsp-server--language-servers)).

`npx octocode <command> --help` is the live reference. A tool's help ends with
its required fields, per variant, and one runnable example. A bare
`npx octocode` prints the command reference on a terminal and the tool catalog
with agent instructions on a pipe.

## Quick start

```bash
npx octocode auth status --json
npx octocode schema
npx octocode structureSearch '{"queries":[{"operation":"tree","path":"src"}]}'
npx octocode localSearch '{"queries":[{"path":"src","matchString":"createServer"}]}'
npx octocode localFetch '{"queries":[{"path":"src/index.ts","fullContent":true}]}'
```

Replace `npx octocode` with `octocode` when the package is installed globally.

### Queries

- A tool takes `{"queries":[…]}` with 1 to 5 rows, or one bare query object.
  A bare JSON array is rejected.
- Pass the query inline, from a file (`--input FILE`), or from stdin
  (`--input -`). Use a file for long queries to avoid shell quoting.
- Relative local paths resolve from the current directory; results report
  paths relative to the top-level `root`. Pass absolute paths when a script's
  working directory is not the repository root.
- `mainGoal` and `reasoning` are optional; add them only in multi-call research.
- `next.*` continuations complete the result: run them, or name what stays
  unread. Optional `hints` strings suggest calls as `<action>: <tool> <JSON input>`; opt in with `"extras":["hints"]`.
  The contract: [tool data contract](https://github.com/bgauryy/octocode/blob/main/docs/TOOL_DATA_CONTRACT.md).

### Schema discovery

```bash
npx octocode schema                                          # enabled tools, fields, instructions
npx octocode schema <tool>                                   # variants, usage, full query schema, availability
npx octocode schema <tool> --view variants                   # branch names, required fields, examples
npx octocode schema <tool> --view query                      # self-contained query schema
npx octocode schema ghSearchHistory --view query --select operation=commit
```

The catalog lists only tools that run here. `schema <tool>` also answers for a
gated tool and reports `availability.enabled` with the `envVar` that turns it
on. Calling a gated tool exits `5` with `missingConfiguration` naming the
missing setting. Output is indented on a terminal and one line on a pipe.

---

## `ghCloneRepo` — materialize a GitHub repository

```bash
npx octocode ghCloneRepo '{"queries":[{"owner":"vercel","repo":"next.js"}]}'
npx octocode ghCloneRepo '{"queries":[{"owner":"vercel","repo":"next.js","path":"packages/next"}]}'
```

Use `ghCloneRepo` when you need to inspect several files, run structural (AST)
search, or use LSP on remote code. Cloning is CLI-only and requires persistent
storage. After cloning, run `localSearch`,
`localFetch`, or `lspSearch` on the returned absolute local path.

The CLI and MCP server share cache data under the configured Octocode home:

| Bucket | Path | Contents |
|---|---|---|
| Clone | `tmp/clone/{owner}/{repo}/{branch}` | Reusable Git checkouts |
| Tree | `tmp/materialize/v3/{owner}/{repo}/{commitSha}` | Materialized repository trees; `{commitSha}.manifest.json` beside each records the files written |
| Response | `tmp/response/` | Eligible GitHub and npm response payloads |

`cache status` prints the cache directory and recent evictions; `cache clear`
removes cached GitHub responses. See
[Cache storage and lifecycle](https://github.com/bgauryy/octocode/blob/main/docs/CONFIGURATION.md#cache-storage-and-lifecycle).

---

## `graph` — persisted code graph

Parse a repository once, then answer structural questions in milliseconds
without re-reading source. Local tools must be enabled. `npx octocode graph
--help`, `graph ingest --help` and `graph query --help` are the full reference
(node ids, output, exit codes, storage, every flag).

```bash
npx octocode graph ingest .                         # build a snapshot (an unchanged tree is reused)
npx octocode graph query stats                      # size, languages, hubs, gaps
npx octocode graph query find createServer          # locate a node id
npx octocode graph query callers 'src/server.ts#createServer'
npx octocode graph query impact --since origin/main # blast radius and tests to run
npx octocode graph query issues                     # ranked possible problems
npx octocode graph query stale                      # changed since ingest? re-ingest
```

| Question | Op |
|---|---|
| What is in this repo? | `stats`, `hubs`, `symbols <file>` |
| Where is X? | `find <text> [--kind file\|symbol\|package]`, `node <ref>` |
| What does X use, or who uses X? | `deps`, `dependents`, `callers`, `callees` |
| How are A and B connected? | `path <a> <b>`, `walk <ref> --depth n` |
| What breaks if X changes? | `impact <ref>`, `impact --changed a,b`, `impact --since <rev>` |
| What looks wrong? | `issues`, `cycles`, `diagnostics` |
| Is the snapshot current? | `stale` |

- Node ids: `src/a.ts` (file), `src/a.ts#Class.method` (symbol), `pkg:react`
  (package). An ambiguous reference exits `2` and lists `candidates`.
- A cut list adds `truncated` and `next`, a paste-ready command; exit stays `0`.
- Answers that follow calls carry `coverage.callInternalRecall`. Below 0.9 they
  add a `warning`: treat those caller lists as a lower bound.
- Results are leads from syntax. Confirm identity with `lspSearch` before
  deleting or renaming. Reflection, dynamic dispatch and FFI edges are invisible.

How ingest links calls, the snapshot format, and size bounds:
[code graph architecture](https://github.com/bgauryy/octocode/blob/main/packages/octocode-native/docs/engine/CODE_GRAPH.md).

### `issues` — ranked hypotheses

Each finding carries `evidence`, the false-positive `controls` applied,
`verify` commands, and a `score` (severity × confidence × (0.5 + 0.5 × PageRank
percentile)).

| Group | Detectors |
|---|---|
| Structure | `cycle` (runtime imports; witness plus `suggestedCuts`) · `dir-cycle` · `unreachable-file` · `test-only` · `unused-export` (JS/TS/Python) · `export-only-local` (exported but used only in its own file) |
| Dependencies | `undeclared-dependency` (including hoisted phantoms) · `dev-dependency-in-production` · `boundary-violation` (deep imports between npm packages) · `unresolved-import` |
| Architecture | `god-file` · `critical-file` (PageRank) · `single-point-of-failure` (articulation points) · `unstable-dependency` · `main-sequence` · `misplaced-file` |

- Any edge keeps code alive. Only runtime imports between authored files prove
  cycles, hubs, or layering; type-only, dynamic, and Python function-level
  imports never do.
- Go, JVM and .NET files share package scope, so file-level checks skip them.
  Python libraries skip reachability. Generated, bundled, vendored and unparsed
  files are never subjects.
- Each finding has a `tier`: `100` nothing references it; `90` no graph or code
  reference (bare prose words are listed in `evidence.textMentions`); `60` the
  file path, or every unused export, is referenced in code or qualified text
  such as `mod.run` (`evidence.mentionedIn`; some exports alone keep 90), or
  no mention scan ran. The default shows 90 and above; `--min-tier 60` shows
  all, and `summary.hiddenBelowTier` counts the rest.
- `--baseline <snapshot>` labels findings `new` or `existing` and lists
  `resolvedFindings`. `summary.health` reports Lakos NCCD.

### `impact` — blast radius

- A changed file affects every importer, transitively. A changed symbol affects
  only the `calls`, `uses` and `inherits` edges bound to it, plus importers that
  bind no name (`precision: "symbol"`). Barrel files pass changes through by
  symbol.
- Depth defaults to 3 (`--depth` widens it). Rows carry `depth`, `risk`
  (`direct`, `likely`, `transitive`), `packageDistance`, `confidence` and
  `typesOnly`.
- The summary lists `willBreak` (depth 1), `likely` (depth 2), `shouldTest`
  (depth 3+), `affectedEntrypoints`, `testsToRun`, `components`, and
  `testFunctions` (including Rust `mod tests` and pytest `test_*` functions).
- A manifest, lockfile, or tsconfig/pyproject/go.mod change affects everything
  below its directory; `allAffected` marks a root-level change.

### Recipes

| Goal | Walk |
|---|---|
| Who can reach a dangerous operation? | `impact <wrapper>` on the function that deletes, spawns or writes. `affectedEntrypoints` is the attack surface. |
| Unbounded recursion | `cycles --edge calls`; check each SCC that walks untrusted input for a depth bound. |
| Choke points | `issues --detector single-point-of-failure,critical-file`. |
| Is this cycle real? | `path <a> <b>` shows the witness; `issues --detector cycle` gives `suggestedCuts`. |
| Dead or orphaned code | `issues --detector unreachable-file,unused-export`, then `dependents <ref> --edge imports,uses,calls` before deleting. |

---

## `install` — MCP client setup

```bash
npx octocode install --ide cursor
npx octocode install --ide claude-code --check
npx octocode install --ide claude-desktop --force
npx octocode install --ide cursor --dry-run   # preview; --json for the entry
```

`install --list` prints the client ids: Cursor, Claude Desktop, Claude Code,
Windsurf, Trae, Antigravity, VS Code Cline/Roo/Continue, Zed, OpenCode, Gemini
CLI, Kiro, Codex, Goose. Use an exact id; a partial id such as `claude` is
rejected with the ids it could mean. Other flags: `--method npx|bunx|pnpm`,
`--enable-local true|false`, `--pass-env`, `--rollback <file.bak>`. Without
`--ide` on a terminal, the native CLI lists clients and asks for a number.
Press Enter to cancel. Piped or JSON invocations require `--ide`.

---

## `auth` — GitHub authentication

```bash
npx octocode auth status --json     # authenticated, username, tokenSource
npx octocode auth login             # OAuth device flow (--hostname for GitHub Enterprise)
npx octocode auth login --refresh   # exchange the stored refresh token
npx octocode auth logout            # delete stored Octocode credentials
```

Humans run `auth login` once. Agents and CI set `GH_TOKEN` or `GITHUB_TOKEN`,
which take priority over stored logins. Resolution order, storage, refresh and
GitHub Enterprise: [authentication](https://github.com/bgauryy/octocode/blob/main/docs/AUTHENTICATION.md).

---

## `config` — settings and keys

```bash
npx octocode config --json                                # paths, key names, warnings
npx octocode config home                                  # Octocode home directory
npx octocode config get OCTOCODE_BETA                     # resolved value; exit 1 when unset
npx octocode config set OCTOCODE_BETA true                # or a setting path: config set local.beta true
npx octocode config set OCTOCODE_CLASSIFICATION_API --stdin
npx octocode config check OCTOCODE_CLASSIFICATION_API     # exit 0 set, 1 unset; never prints the value
npx octocode config unset OCTOCODE_BETA
npx octocode config view                                  # local settings page
```

- `set`, `unset` and `check` take an environment key or its setting path
  (`classification.api`); `set` and `unset` edit the global `.env` only. They
  keep unrelated lines, lock and replace the file atomically, and never print
  values.
- `set` refuses a [removed setting](https://github.com/bgauryy/octocode/blob/main/docs/generated/CONFIG_SETTINGS.md#removed-settings)
  with `invalidInput` (exit `2`). Internal limits such as timeouts, retries and
  page sizes are not settings.
- `get` masks secrets as `[REDACTED-<KEY>]` and names where the value lives.
  `check --json` on an unset GitHub token key adds `githubTokenSource`, the
  credential GitHub calls use instead.
- Process variables and a workspace `.octocode/.env` still override a global
  value. Precedence, home-only keys, and every setting:
  [configuration](https://github.com/bgauryy/octocode/blob/main/docs/CONFIGURATION.md).

---

## `lsp-server` — language servers

```bash
npx octocode lsp-server list                 # managed downloads and install status
npx octocode lsp-server status src/main.rs   # which language and server a file resolves to
npx octocode lsp-server install rust-analyzer
npx octocode lsp-server install --all
```

Use it when `lspSearch` reports a server is unavailable. Managed downloads
cover `rust-analyzer` and `clangd`. Built-in routes and custom servers:
[language servers](https://github.com/bgauryy/octocode/blob/main/docs/OCTOCODE_TOOLS.md#language-servers).

---

## `skill` — agent skills

The native executable embeds the public skills from this repo's `skills/`
directory. The Node package ships the same files and delegates skill commands
to that executable. `install` copies a skill into the durable store
`$OCTOCODE_HOME/skills/<name>` atomically, then links each selected platform's
skill directory to that copy. Links never target an npm or `npx` cache.

```bash
npx octocode skill list
npx octocode skill info octocode-research
npx octocode skill install octocode-research --platform pi --global
npx octocode skill install --all --platform pi,cursor --global
npx octocode skill install octocode-research --platform codex --project-dir "$PWD"
npx octocode skill install --add ./skills/my-skill --platform claude --global
npx octocode skill check --json
npx octocode skill remove octocode-research --platform pi
```

| Flag | Meaning |
|---|---|
| `--platform pi,cursor,claude,codex,opencode,copilot,gemini,all` | Agent skill directories (`codex` is the shared `.agents/skills` location). `all` selects all seven. |
| `--global` / `--project-dir <dir>` | Link scope; use exactly one with `--platform`. |
| `--add <path>` | Install a local skill directory (or its `SKILL.md`). Not combinable with `--all`. |
| `--path <dir>` | Use a custom store instead of `$OCTOCODE_HOME/skills`. Not combinable with `--platform`. |
| `--mode symlink\|copy\|auto` | Install strategy; `symlink` is the default, `copy` a portability fallback. |
| `--force` | install: replace differing content (kept by default). remove: also delete real directories. |
| `--upgrade` | Refresh changed bundled content in the store. A copy refreshes only while it still matches the previous content; other drift stays a conflict. |
| `--dry-run` | Preview `install`, `remove`, or `check --fix` without writing. |
| `--fix` | `check`: refresh stale or broken installs in place; never adds platforms. A failed repair exits 1. |
| `--workspace` | `check --fix`: also repair existing `<cwd>/.agents/skills` installations. |
| `--no-env` | `check`: skip environment readiness. |

`skill list` marks installs that differ from the bundled copy `[stale]` and
broken links `[broken]`. `skill check` reports `ok`, `stale`, `broken` or
`not-installed`, plus readiness: `needs-config` (a required setting is missing)
or `partial` (an optional setting would unlock more). A GitHub token from
`auth login` or a `gh` login counts as set. `check` exits 1 on stale, broken or
needs-config.

Every skill command works directly from the native binary without Node, npm,
network access, or another `octocode` on `PATH`. For example:
`octocode skill install --all --platform codex --global`. JSON reports identify
embedded sources as `bundled:<name>`; installed paths remain filesystem paths.
`check --fix --json` repairs existing installations and reports the resulting
state. Links to external development checkouts are left intact.

---

## Output and exit codes

Tools and `graph` print readable text on a terminal and JSON on a pipe;
`schema` always prints JSON, and `--json` makes every command print JSON. JSON is
indented on a terminal and one compact line on a pipe.

Errors follow the output: the `{"error":"…","errorCode":"…"}` envelope on stdout
in JSON mode (plus `details` when there are repair steps), text on stderr
otherwise. Every command, `skill` included, uses this envelope. A mistyped command
or flag gets it too: `error` is the parser's first line, and `details` keeps the
rest, such as possible values, the did-you-mean tip and usage. When a pipe, not
`--json`, chose JSON and stderr is a terminal, the error text is also written to
stderr, so `octocode … | jq` still shows why a call failed; stdout is unchanged.
`NO_COLOR` disables color. If the npm launcher cannot resolve or start the
native binary, it reports the startup failure on stderr and exits `5`.

### Exit codes

| Code | Meaning |
|---:|---|
| `0` | Success, including a typed empty payload and a result with more pages. |
| `1` | Every row empty or out of range (`status: outOfRange`, a page past the last) / no matches. |
| `2` | Invalid input or flags, including any batch row rejected as `invalidInput`. |
| `3` | Not found. |
| `4` | Authentication or permission failure. |
| `5` | Execution error, including an unavailable tool, a missing native runtime, or a configuration viewer startup failure. |
| `7` | Rate limited. |
| `130` | Interrupted (Ctrl-C). |

A batch exits with its worst row: a rejected row (`2`); then a failed row
(`status:"error"`), with the class of its error code (`3`, `4`, `5` or `7`; `5`
when failed rows disagree); then every row empty (`1`); else `0`. An answering
row never hides a failed one.

Paging is success: a result with `next.*`, `pagination.hasMore` or a partial
read exits `0`, as MCP (which has no exit codes) reports it. A stale snapshot
(`staleSnapshot`) exits `5` with `next.restart`: start over rather than page.
Exit `0` means no row failed; read `results[].status` for empty or partial rows.

---

## How the CLI aligns with MCP

- Tool commands run the same named tools as MCP, with identical query contracts.
- MCP lists only available tools and never the CLI-only `ghCloneRepo` and
  `astTopology`.
- `install` writes the client entry that runs `octocode-mcp`; `auth` manages
  the credentials both use; `skill` needs no MCP transport.
- `@octocodeai/octocode-core` authors schemas and instructions,
  `@octocodeai/config` delivers them, `@octocodeai/octocode-native` validates
  and runs them, and `octocode` and `octocode-mcp` are thin launchers.

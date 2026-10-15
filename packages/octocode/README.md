# Octocode CLI

`octocode` researches code from your terminal: local files, GitHub
repositories, pull requests and history, and package registries. It also adds
the Octocode MCP server to agent clients and installs Octocode Agent Skills.
Every research tool runs in a native Rust engine.

## Run

Requires Node.js `^24.15.0`. Nothing to install:

```bash
npx octocode --help
```

## Quick start

```bash
npx octocode auth login                                       # optional: private repos, higher rate limits
npx octocode localSearch '{"path":".","matchString":"TODO"}'  # search this directory
npx octocode localFetch --help                                # required fields and an example for any tool
npx octocode install --ide cursor                             # add the MCP server to an agent client
npx octocode skill install --all --platform claude --global   # install the Agent Skills
```

## Commands

### Research tools

Each tool takes one JSON query: inline, from a file (`--input FILE`), or from
stdin (`--input -`). Batch up to 5 with `{"queries":[…]}`.
`npx octocode <tool> --help` lists the required fields and a runnable example;
`npx octocode schema <tool> --view query` lists every field.

| Command | Use it to |
|---|---|
| **Local** | |
| `localSearch` | Find literal or regex matches in local files. |
| `localFetch` | Read a known local file or an exact source region. |
| `structureSearch` | Outline local directories or find files by name or metadata. |
| `astSearch` | Find declarations, syntax trees, or structural code matches. |
| `lspSearch` | Resolve callers, references, same-name symbols, types, or diagnostics. |
| **GitHub** | |
| `ghSearchRepo` | Discover repositories by keywords, owner, or filters. |
| `ghSearchCode` | Find default-branch code or file paths in an owner or repository. |
| `ghStructure` | Browse a repository's tree, refs, or languages. |
| `ghGetFileContent` | Read a known GitHub file or an exact source region. |
| `ghSearchHistory` | Find pull requests, issues, or commits. |
| `ghGetHistoryItem` | Read a known pull request, issue, commit, or comparison. |
| `ghCloneRepo` | Cache a shallow checkout for repeated local analysis (CLI only). |
| **Packages** | |
| `artifactSearch` | Find package versions, dependencies, or upstream release source (npm, PyPI, crates, Maven, NuGet, Go, Packagist, RubyGems). |
| **Beta** (`OCTOCODE_BETA=true`) | |
| `clasify` | Typed answers about unread text, images, or held data. Also needs `OCTOCODE_CLASSIFICATION_API`. |
| `astTopology` | Analyze local dependency and reachability topology (CLI only). |

```bash
npx octocode ghSearchHistory '{"operation":"pullRequest","owner":"bgauryy","repo":"octocode","state":"merged"}'
npx octocode artifactSearch '{"ecosystem":"npm","packageName":"zod"}'
echo '{"path":"src/index.ts","ranges":["1-40"]}' | npx octocode localFetch --input -
```

### Code graph

Parse a repository once, then answer structural questions in milliseconds.

```bash
npx octocode graph ingest .
npx octocode graph query callers 'src/server.ts#createServer'
npx octocode graph query impact --since main  # blast radius of your branch
```

### Setup and management

| Command | Does |
|---|---|
| `schema [tool]` | List the enabled tools with agent instructions, or print one tool's input contract. |
| `config` | Show config and `.env` paths and loaded key names; `home`, `get`, `set`, `unset`, `check`, `view`. |
| `auth status\|login\|logout` | GitHub sign-in with the device flow, its status, and sign-out. |
| `install --ide <id>` | Add the Octocode MCP server to a client (`--list` for ids). |
| `skill list\|info\|install\|remove\|check` | Manage the bundled Agent Skills. |
| `help [command]` | Help for any command (also `--help`, `-h`). |

Output is readable text on a terminal and one JSON line on a pipe or with
`--json`. Exit `0` includes results with more pages: follow `next.*`.

## Documentation

- [CLI guide](https://github.com/bgauryy/octocode/blob/main/packages/octocode/docs/OCTOCODE_CLI.md):
  every command, flags, graph, and exit codes
- [Tool reference](https://github.com/bgauryy/octocode/blob/main/docs/OCTOCODE_TOOLS.md)
- [Configuration](https://github.com/bgauryy/octocode/blob/main/docs/CONFIGURATION.md)
  and [Authentication](https://github.com/bgauryy/octocode/blob/main/docs/AUTHENTICATION.md)

## Development

From the repository root:

```bash
yarn workspace octocode build
yarn workspace octocode test
```

See [CLI architecture](https://github.com/bgauryy/octocode/blob/main/packages/octocode/ARCHITECTURE.md).

## License

MIT

---
name: octocode-cli
description: Use `octocode-cli` subcommands (or `exec` code mode) to execute Octocode MCP tools from a terminal without wiring MCP. Use when the user asks to "run octocode from shell", "use octocode without MCP", "call githubSearchCode from CLI", wants a one-off GitHub code/file/PR search, or needs to orchestrate multiple tool calls in one command via a JS script.
---

# Octocode CLI — Agent Cheat Sheet

Six flag-driven subcommands plus `exec` (code mode). No MCP server required.

| Subcommand | Tool | Required flags |
|---|---|---|
| `search-code` | `githubSearchCode` | `--query` |
| `get-file` | `githubGetFileContent` | `--owner --repo --path` |
| `view-structure` | `githubViewRepoStructure` | `--owner --repo` |
| `search-repos` | `githubSearchRepositories` | _(none)_ |
| `search-prs` | `githubSearchPullRequests` | _(none)_ |
| `package-search` | `packageSearch` | `--name --ecosystem` |
| `exec` | code mode (`oct.*` namespace) | positional script, `--file`, or stdin |

Auto-filled: `id`, `mainResearchGoal`, `researchGoal`, `reasoning`. Don't pass them.

## Quick recipes

```bash
# Code search
octocode-cli search-code --query 'useReducer,dispatch' --owner facebook --repo react --limit 5

# Fetch a file around a match
octocode-cli get-file --owner facebook --repo react \
  --path packages/react/src/React.js --match-string useState

# Tree view
octocode-cli view-structure --owner bgauryy --repo octocode-mcp --depth 2

# Repo search by topics/stars
octocode-cli search-repos --topics typescript,mcp --stars '>=100' --sort stars

# Merged PR search
octocode-cli search-prs --owner facebook --repo react --merged --limit 20

# Package search
octocode-cli package-search --name react --ecosystem npm --npm-fetch-metadata
```

## Code mode (`exec`)

Use `exec` when one request needs multiple tool calls. The script runs inside a sandbox with a typed `oct.*` namespace — no `require`, `process`, or network access. `await` and `return` work at the top level.

```bash
# Parallel code search across repos
octocode-cli exec '
  const repos = [["facebook","react"], ["vuejs","core"]];
  const hits = await Promise.all(
    repos.map(([owner, repo]) =>
      oct.searchCode({ owner, repo, keywordsToSearch: ["useState"] })
    )
  );
  return hits.map(r => r.content?.[0]?.text?.length ?? 0);
'

# Script from file
octocode-cli exec --file ./research.js

# Via stdin
echo 'return await oct.tools()' | octocode-cli exec

# JSON output (returnValue + captured logs)
octocode-cli exec --json 'console.log("hi"); return { ok: true }'
```

`oct.*` surface: `searchCode`, `getFile`, `viewStructure`, `searchRepos`, `searchPullRequests`, `packageSearch`, `localSearchCode`, `localGetFile`, `localFindFiles`, `localViewStructure`, `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`. Generic entrypoints: `oct.tool(name, input)` and `oct.tools()`.

Each function accepts a single query object, an array of queries, or `{ queries: [...] }`. Shared research fields are auto-filled. Timeout is `--timeout <ms>` (default 60000).

## Flag conventions

- Comma-separated lists: `--query 'a,b,c'` → `keywordsToSearch: ['a','b','c']`.
- Kebab-case flags map to camelCase fields: `--match-string` → `matchString`, `--full-content` → `fullContent`.
- Numeric flags (`--limit`, `--depth`, `--start-line`, `--end-line`) are parsed as numbers. Non-numeric values exit with code 1.
- Boolean flags: `--merged`, `--draft`, `--full-content`, `--with-comments`, `--with-commits`, `--npm-fetch-metadata`, `--python-fetch-metadata`.

## Bulk queries via stdin

Pipe `{"queries":[...]}` JSON to any subcommand. When stdin is present, command-line flags are ignored.

```bash
echo '{"queries":[
  {"keywordsToSearch":["useState"],"owner":"facebook","repo":"react"},
  {"keywordsToSearch":["useEffect"],"owner":"facebook","repo":"react"}
]}' | octocode-cli search-code
```

## Output modes

- Default: human-readable text (the tool's text content blocks).
- `--json`: raw tool envelope, including `content` and `structuredContent`. Pipe into `jq` when parsing.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Tool ran and returned a non-error result |
| `1` | Missing required flag, bad JSON on stdin, validation failure, or tool returned `isError: true` |

## When to use which

- **Finding code**: `search-code` with `--query` and optional `--owner/--repo/--path/--extension`.
- **Reading a file**: `get-file`. Use `--match-string` + `--match-context-lines` for a window, `--start-line/--end-line` for a range, or `--full-content` for the whole file.
- **Mapping a repo**: `view-structure`. `--depth 1` for a shallow tree, more for deeper.
- **Discovering repos**: `search-repos` with `--topics` or `--query`, filter by `--stars`/`--sort`.
- **PR archaeology**: `search-prs` with `--author`, `--merged`, date ranges.
- **Package info**: `package-search` with `--ecosystem`. Add `--npm-fetch-metadata` or `--python-fetch-metadata` for registry details.

## Authentication

GitHub tools need a token. The CLI uses Octocode-stored creds or `gh` CLI, in that order. If neither is set:

```bash
octocode-cli login          # Octocode-managed OAuth
# or
gh auth login               # gh CLI token (also picked up)
```

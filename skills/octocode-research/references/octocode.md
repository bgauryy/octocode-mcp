Load when invocation, a query shape, availability, pagination, exit codes, or recovery is unclear. Live `schema` output is authoritative.

## Invoke

```bash
npx octocode schema
npx octocode schema localSearch        # variants with runnable examples
npx octocode schema localSearch --view query
```

- MCP and CLI take `{ "queries": [query, ...] }` (clasify too); a bare query runs as one row.
  `npx octocode localFetch '{"queries":[{"path":"src/index.ts","ranges":["1-40"]}]}'`
- Validation failure: fix the named field.
- `extras:["hints"|"details"|"stats"|"receipts"|"echo"|"diagnostics"]` adds opt-in fields; continuations inherit it.

## 16 public tools

The default catalog contains 12 tools. `OCTOCODE_BETA=true` alone adds nothing on MCP; read-tool `classifiers` have a separate ranking gate.

- GitHub: `ghSearchCode`, `ghStructure`, `ghSearchRepo`, `ghGetFileContent`, `ghSearchHistory`, `ghGetHistoryItem`, `ghCloneRepo`.
- Local: `localSearch` (text), `structureSearch` (layout), `astSearch` (syntax), `localFetch` (content), `lspSearch` (identity).
- Other: `astTopology`, `astRewrite`, `artifactSearch` (packages), `clasify`.
- `ghCloneRepo`, `astTopology`, `astRewrite`: CLI-only; MCP never lists them.
- GitHub: `GH_TOKEN` or `GITHUB_TOKEN`. Read-tool `classifiers`: nonblank `OCTOCODE_CLASSIFICATION_API` (or `classification.api`) plus ranking enabled; public `clasify` also needs `OCTOCODE_BETA=1`. `astTopology` and `astRewrite` need `OCTOCODE_BETA=true`.
- `ghCloneRepo` needs `OCTOCODE_ENABLE_LOCAL` and persistent `OCTOCODE_STORAGE_MODE` (default); `ENABLE_CLONE` is ignored.
- Settings (`OCTOCODE_ENABLE_LOCAL`, `OCTOCODE_STORAGE_MODE`, `OCTOCODE_LSP_PREWARM`) go in `<HOME>/.octocode/.env`. Inspect live config before changing it; never change it automatically or print credentials.
- Possibly unavailable: check `schema` (`availability`), `auth status`, `lsp-server status <file>`. An unavailable tool is a gap, not empty.

## Read results and recover

- Row `status` `error`: use its repair (`hints.text` tip, `hints.repair` lead, or `next.restart` page). Check hoisted `shared` before calling a field missing.
- `next.*` page (rows or nested payloads): it carries fields schemas omit; a coverage claim runs every page.
- `hints.*` lead: a ready `{tool, query}` named by purpose (`read`, `readPullRequest`, `viewRepo`, ...); skipping it never leaves a result incomplete. `hints.text` is a per-call fact. Successful rows show leads only with `extras:["hints"]`, except defaults such as `includeIgnored` and `countFiles`.
- GitHub empty or unindexed: provider blind spot; verify the path, or materialize and search locally.
- Result, match, content, patch, and diagnostic pagination are independent: inspect limits even when `hasMore:false`.
- Finish `responsePagination` (oversized batch response) before a row continuation.
- Terminal limit: narrow the query; never invent a cursor.
- Exit codes: `0` ok · `1` empty · `2` input (any rejected row) · `3` not-found · `4` auth · `5` execution · `7` rate-limit. A result with a next page is still `0`: follow `next.*`.

## Templates

- Replace paths, lines, refs, and numbers with observed values; wrap per [Invoke](#invoke).
- `astTopology` (CLI only): entrypoints are relative to its `path`.
- `astRewrite` previews; apply only with `apply:true` and the full `expectedHashes` (or the returned `hints.apply`).

```json
[
  {"tool":"localSearch","query":{"path":"/ABS/repo/src","matchString":"withDataCache|createDataCache","resultView":"files"}},
  {"tool":"structureSearch","query":{"operation":"files","path":"/ABS/repo","include":["*.config.*"]}},
  {"tool":"localFetch","query":{"path":"/ABS/repo/src/example.ts","matchString":["export function","throw new"],"block":true}},
  {"tool":"localFetch","query":{"path":"/ABS/repo/src/example.ts","ranges":["10-30","120-140"]}},
  {"tool":"astSearch","query":{"operation":"symbols","path":"/ABS/repo/src","symbolName":["createServer","listen"]}},
  {"tool":"lspSearch","query":{"path":"/ABS/repo/src/example.ts","operation":"references","symbolName":"example","line":10,"includeDeclaration":false,"groupByFile":true}},
  {"tool":"astTopology","query":{"operation":"reachability","path":"/ABS/repo","entrypoints":["src/index.ts"]}},
  {"tool":"ghSearchCode","query":{"owner":"tokio-rs","repo":"tokio","keywords":["max_blocking_threads"],"path":"tokio/src/runtime"}},
  {"tool":"ghGetFileContent","query":{"owner":"tokio-rs","repo":"tokio","path":"tokio/src/runtime/builder.rs","matchString":"max_blocking_threads: 512","block":true}},
  {"tool":"ghGetHistoryItem","query":{"operation":"issue","owner":"cli","repo":"cli","number":14404}},
  {"tool":"ghGetHistoryItem","query":{"operation":"pullRequest","owner":"cli","repo":"cli","number":13541,"matchString":"MatchCategory","contextLines":0,"include":["pkg/"]}},
  {"tool":"ghGetHistoryItem","query":{"operation":"compare","owner":"octokit","repo":"octokit.js","base":"v4.0.0","head":"v5.0.0"}},
  {"tool":"artifactSearch","query":{"ecosystem":"npm","packageName":"express","version":"4.21.2"}},
  {"tool":"ghCloneRepo","query":{"owner":"octokit","repo":"octokit.js","ref":"main","path":["src","test"]}},
  {"tool":"clasify","query":{"source":{"tool":"ghGetFileContent","query":{"owner":"psf","repo":"requests","path":"src/requests/sessions.py","ref":"v2.32.3","fullContent":true}},"questions":{"auth":{"type":"noul","instructions":"Does the file remove the Authorization header when a redirect changes host?"}}}}
]
```

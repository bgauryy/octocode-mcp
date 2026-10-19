Load when invocation, a query shape, availability, pagination, exit codes, or recovery is unclear. Live `schema` output is authoritative.

## Invoke

```bash
npx octocode schema
npx octocode schema localSearch        # variants with runnable examples
npx octocode schema localSearch --view query
```

- MCP and CLI take `{ "queries": [query, ...] }` (clasify too); the CLI also runs a bare query as one row.
  `npx octocode localFetch '{"queries":[{"path":"src/index.ts","ranges":["1-40"]}]}'`
- Validation failure: fix the named field.
- `extras:["hints"|"details"|"stats"|"receipts"|"echo"|"diagnostics"]` adds opt-in fields; continuations inherit it.

## 15 public tools

The default catalog contains 12 tools over MCP and 13 in the CLI; the live catalog lists actual availability. The full schema inventory also includes beta tools. Inline `clasifyContext` needs a nonblank classification API credential; public `clasify` additionally needs beta. There is no separate selection switch.

- GitHub: `ghSearchCode`, `ghStructure`, `ghSearchRepo`, `ghGetFileContent`, `ghSearchHistory`, `ghGetHistoryItem`, `ghCloneRepo`.
- Local: `localSearch` (text), `structureSearch` (layout), `astSearch` (syntax), `localFetch` (content), `lspSearch` (identity).
- Other: `astTopology`, `artifactSearch` (packages), `clasify`.
- `ghCloneRepo` and `astTopology`: CLI-only; MCP never lists them.
- GitHub: `GH_TOKEN` or `GITHUB_TOKEN`. Classification credential: `OCTOCODE_CLASSIFICATION_API` (or `classification.api`); public `clasify` also needs `OCTOCODE_BETA=1`. `astTopology` needs beta too. Calls without `clasifyContext` perform ordinary retrieval without JEV.
- `ghCloneRepo` needs `OCTOCODE_ENABLE_LOCAL` and persistent `OCTOCODE_STORAGE_MODE` (default); `ENABLE_CLONE` is ignored.
- Settings (`OCTOCODE_ENABLE_LOCAL`, `OCTOCODE_STORAGE_MODE`, `OCTOCODE_LSP_PREWARM`) go in `<HOME>/.octocode/.env`. Inspect live config before changing it; never change it automatically or print credentials.
- Possibly unavailable: check `schema` (`availability`), `auth status`, `lsp-server status <file>`. An unavailable tool is a gap, not empty.

## Read results and recover

- Row `status` `error`: use its repair (`hints` tip, `repair` in `hints` lead, or `next.restart` page). `clasify` uses `queries[].error` with nested `error.hints`. Check hoisted `shared` before calling a field missing.
- Copy needed page calls unchanged; they carry fields compact schemas omit. A coverage claim must cover every page in its declared view. With classification, `selection` describes candidate decisions, not completeness of the corpus.
- Classification has separate calls for selected pages, unjudged candidates, unknown inspection and the complete original view. Follow the [classification recovery guide](clasify.md#recover-from-unknown-or-error) to choose the needed call and stop when the evidence is sufficient.
- `hints` is a string list: per-call facts or `<action>: <tool> <JSON input>` suggestions. Copy the JSON unchanged when following a suggestion; `Approximate:` marks low confidence. Suggestions do not complete unread pages. Successful-row suggestions need `extras:["hints"]` except the contract's default leads and the captured-source read from `clasify`.
- GitHub empty or unindexed: provider blind spot; verify the path, or materialize and search locally.
- Result, match, content, patch, and diagnostic pagination are independent: inspect limits even when `hasMore:false`.
- Finish `responsePagination` (oversized batch response) before a row continuation.
- Terminal limit: narrow the query; never invent a cursor.
- Exit codes: `0` ok · `1` empty · `2` input (any rejected row) · `3` not-found · `4` auth · `5` execution · `7` rate-limit. A result with unread pages may still exit `0`; inspect its coverage before claiming completeness.

## Templates

- Replace paths, lines, refs, and numbers with observed values; wrap per [Invoke](#invoke).
- `astTopology` (CLI only): entrypoints are relative to its `path`.

```json
[
  {"tool":"localSearch","query":{"path":"/ABS/repo/src","matchString":"withDataCache|createDataCache","regex":"rust","resultView":"files"}},
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

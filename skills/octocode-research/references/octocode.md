# Octocode interfaces

Load when invocation, availability, or recovery is unclear. Live `schema` output is authoritative. Per-flow diagrams (local, GitHub, history, external → local, pages, hints, clasify): [OCTOCODE_WORKFLOWS.md](https://github.com/bgauryy/octocode/blob/main/docs/OCTOCODE_WORKFLOWS.md).

```bash
npx octocode schema
npx octocode schema localSearch        # variants with runnable examples
npx octocode schema localSearch --view query
```

`extras:["hints"|"details"|"stats"|"receipts"|"echo"|"diagnostics"]` on a query adds those opt-in fields (`hints`: leads on a successful row); continuations inherit it. MCP and the CLI both take `{ "queries": [query, ...] }` (clasify too); a bare query runs as one row. On validation failure fix the named field.

## 16 public tools

The default catalog contains 12 tools; public `clasify` appears only with beta and a nonblank classification API credential. `OCTOCODE_BETA=true` alone adds nothing on MCP. Read-tool goals use a separate ranking gate.

| Evidence question | Tool |
|---|---|
| GitHub code / tree / repositories | `ghSearchCode` / `ghStructure` / `ghSearchRepo` |
| GitHub file / history search / history item / clone | `ghGetFileContent` / `ghSearchHistory` / `ghGetHistoryItem` / `ghCloneRepo` |
| Local text / layout / syntax / content / identity | `localSearch` / `structureSearch` / `astSearch` / `localFetch` / `lspSearch` |
| Topology / rewrite / packages / classification | `astTopology` / `astRewrite` / `artifactSearch` / `clasify` |

`ghCloneRepo`, `astTopology` and `astRewrite` are CLI-only; MCP never lists them. `ghCloneRepo` needs persistent storage (the default). `astTopology` and `astRewrite` need `OCTOCODE_BETA=true`; public `clasify` needs beta and a nonblank classification API credential (`OCTOCODE_CLASSIFICATION_API` or `classification.api`). Check reach with `schema` (`availability`), `auth status`, and `lsp-server status <file>`; report an unavailable tool as a gap, not as empty.

## Output and recovery

- A row `status` `error` names its repair: its `hints.text` tip, `hints.repair` lead, or `next.restart` page. Check hoisted `shared` before calling a field missing.
- `next.*` pages sit in rows and nested payloads; they carry fields schemas omit. Coverage claims run every page.
- `hints.*` holds leads (`read`, `readPullRequest`, `viewRepo`, `clasify`, …), each a ready `{tool, query}` named by purpose, and `hints.text` only for a per-call fact; skipping one never leaves a result incomplete. A successful row shows leads only with `extras:["hints"]` (default leads such as `includeIgnored` and `countFiles` always show); empty and failed rows keep theirs.
- Result, match, content, patch, and diagnostic pagination are independent; inspect limits even when `hasMore:false`. `responsePagination` pages an oversized batch response (`responseScope`: text, structured, or rows); finish it before following a row continuation. A terminal limit calls for a narrower query, never an invented cursor.
- GitHub empty or unindexed is a provider blind spot: verify the path or materialize and search locally.

Exit codes: `0` ok · `1` empty · `2` input (any rejected row) · `3` not-found · `4` auth · `5` execution · `7` rate-limit. A result with a next page is still `0`: follow `next.*`.

Next: a query shape → `tool-examples.md`; otherwise return to the route that sent you.

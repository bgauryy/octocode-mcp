# TODO

Parked work and open decisions. Remove an entry when it is done or dropped.

## Parked tools

- **astRewrite (beta, disabled).** Disabled on MCP and the CLI, even with `OCTOCODE_BETA`, through the core tool policy `disabled: true` (`octocode-core` `TOOL_POLICIES`). The code and its module tests stay. Before re-enabling:
  - Decide the field naming: `rewrite` (pattern form) and `fix` (rule form) are two names for one purpose.
  - Decide whether `constraints`/`utils`/`transform` stay valid both at the top level and inside `rule`.
  - Re-run the astRewrite review lane (preview → apply on a scratch copy, CRLF, identity rewrites, `selectedMatchIds`) and the e2e driver.
  - Fix `next.nextPage` injecting defaults the source query never set (`apply:false`, `maxFiles:2000`, `maxMatches:10000`); found by the e2e driver with `{"path":"src","language":"typescript","pattern":"shout($A)","rewrite":"yell($A)","pageSize":1}`.

## Deferred decisions

- **clasify:** no changes for now. Open items: the `maxChars` minimum (native tests use small values), the `next.clasify` continuation shape (bare `{queries}` vs `{tool, query}`), and whether direct-read leads and search-candidate leads should both pin a snapshot.
- **ghStructure `languages`:** accepts `page` silently. Left as is by decision.
- **Release:** rebuild and publish the five stale platform artifacts (`build:publish`, `check-outputs`, publish, `brew:formula`).
- **GitHub read default `minify:"standard"`:** drops comments and blank lines (a bare paged read of ReactFiberWorkLoop.js delivered 5268 of 5691 lines). `fullContent` and `minify:"none"` are lossless. Decide whether the default should be lossless.
- **JEV RFC phase 4:** the classifier comparison harness (ordinary vs max-ANY vs per-classifier union), the frozen corpus and the smoke run are not started; they spend classification calls.

## Open leftovers

- **Engine functions over 120 lines (17):** for example `graph scan_with_budget`, `js_oxc_commonjs collect_common_js_loads`, `syntax_tree inspect_bounded`, `lsp client start`; also `github budget try_admit` (concurrency-sensitive).
- **config-view manage protocol:** CONFLICT/INVALID_INPUT/FORBIDDEN are not declared error codes; map them (native `cli/mod.rs`, `config-view.ts`, `server.ts`, browser app).
- **R30 covers `.octocoderc` only:** a workspace `.env` can still raise numeric caps.
- **ghGetHistoryItem empty `matchString`:** repairs with prose ("read the inventory (sections:[\"files\"])") instead of a `{tool, query}` lead.
- **clasify union errors:** a row with `source` naming an unsupported reader reports the `state` branch (Zod parity in `contracts/validate/union.rs`).
- **Tests:** about 66 `tempfile::tempdir` fixtures in local_search/local_fetch tests not on `Fixture::write`; loop page walks not on `checks::walk`; pid-named temp roots in `engine/structural/mod_tests.rs` and `search/fs_query.rs`.
- **structure_search:** `FilesWalk` and `TreeWalk` built from near-identical struct literals (`files.rs`, `tree.rs`).

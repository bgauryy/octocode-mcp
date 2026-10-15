# Issues

Open defects, owner decisions, release prerequisites and known limitations. Every entry was
reproduced or traced in code on 2026-10-15. Delete an entry when it is fixed or dropped, and keep
the regression test in code. `runtime/` = `packages/octocode-native/crates/runtime/src/`.

## Defects

- **Clone cache serves private checkouts across credentials (security).** Checkout, lock and
  default-branch alias keys use only owner/repo/ref/host (`runtime/tools/gh_clone_repo/cache.rs:111-114,
  168-208, 210`). `execute_clone` returns a cache hit without any GitHub or git network call
  (`runtime/tools/gh_clone_repo/mod.rs:447-454, 510-544`); the only API call (`commit_sha`) runs
  after a git failure (`:216-236`). The runtime accepts a per-request `githubToken`
  (`runtime/runtime/engine.rs:703-737`), so on a host serving several users from one runtime, a
  repo cloned with token A is handed to token B or to an anonymous caller for the cache lifetime
  (24 h default). Every other GitHub cache is partitioned by credential (`github/src/partition.rs`).
  Fix: an authenticated `commits/{ref}` check with the caller's credential before serving a hit
  (404/403 → notFound), or the credential partition in the keys. Multi-user hosts also need separate
  homes, because local tools can read the clone root.
- **GitHub `fullContent` is lossy when a page is too large.** `runtime/response/read_share.rs:215-224`
  reruns an over-window `fullContent` row without `fullContent` and without pinning `minify:"none"`,
  so the lossy default view applies and the continuation carries no `minify`. Measured on
  `ReactFiberWorkLoop.js` (react/react@098d2e87, 5,691 lines): `fullContent:true` delivered 5,268
  lines across 16 pages, dropping all 423 blank lines; `minify:"none"` delivered 5,691. This
  contradicts the schema text ("preserving ranges/fullContent") and the test at
  `runtime/tools/gh_get_file_content/mod.rs:1450`.
- **Workspace `.env` raises numeric caps silently.** The R30 guard `drop_workspace_raises`
  (`runtime/config/resolver.rs:456`) runs on the workspace
  `.octocoderc` only; `merged_env`/`apply_env` (`runtime/config/dotenv.rs`) let a workspace `.env` win per key and
  outrank the home `.octocoderc`. Repro with home `defaultCharLength=20000`: workspace rc 50000 →
  16,032 chars plus `workspace_config_raises_limit`; workspace `.env`
  `OCTOCODE_OUTPUT_DEFAULT_CHAR_LENGTH=50000` → 46,106 chars, no warning. `REQUEST_TIMEOUT`,
  `MAX_RETRIES`, `OCTOCODE_MAX_RATE_LIMIT_WAIT`, the three clone-cache caps and the four
  `OCTOCODE_CLASSIFICATION_*` spend caps are exposed (only `OCTOCODE_LSP_MAX_MEMORY_MB` is
  home-only). A cloned repo can raise spend, timeout and retry caps to the contract maxima. Fix:
  apply the lower-only rule and warning to workspace `.env` numeric bindings (the `dotenv.rs` test
  that expects a workspace `REQUEST_TIMEOUT` to win must change with it).
- **Skill scripts exit silently through a symlink.** `verify-claims.mjs:175`, `search.mjs:164` and
  `fetch-asset.mjs:106` in `skills/octocode-brainstorming/scripts/` compare
  `fileURLToPath(import.meta.url)` (symlinks resolved) with an unresolved `process.argv[1]`. Run via
  `~/.agents/skills/…` or a macOS `/tmp` path, `--help` and even `--ledger /nonexistent` print
  nothing and exit 0, so a verification gate reads as a pass. The same pattern is in
  `skills-dev/octocode-dev/scripts/{prepublish,package-build,dev-unify-check}.mjs`,
  `packages/octocode-config/scripts/generate-tool-contract.ts:101`,
  `packages/octocode-pi-extension/scripts/generate-casefold.mjs:34`,
  `packages/octocode-agents-communication/src/pack-runtime.mjs:49`,
  `packages/octocode-benchmark/compare/bin/classification_proxy.mjs:103` and the harness
  `sensors`/`soak`/`tool-health/mock-server` scripts. Fix: the `realOrSelf` check used by every
  `render-report.mjs` (around line 1511).
- **clasify union errors name the wrong branch (native only).** Core Zod reports both cases
  correctly, breaking the parity `runtime/contracts/validate/union.rs:1` claims with `unionIssues.ts`.
  With two or more issues in the default form (for example `questions` as an array plus a
  `ghGetFileContent` source without owner/repo) the error names the models form:
  `questions`/`source: Unknown field`, `operation: Missing required field`. An unsupported
  `source.tool` (for example `astSearch`) with neither `ranges` nor `fullContent` leads with
  `source.query.ranges: Missing required field` and puts the `tool` enum second. Cause: `score()`
  (`union.rs:435-474`) counts only const/enum/unknown-field issues as selector rejections, so a
  branch missing its `operation` discriminator scores close and the raw issue count decides (2
  against 3); issues come out in property order (`query` before `tool`, `validate/schema.rs:382-395`),
  and `tool` is not in `SELECTORS` (`union.rs:9`). Fix: count a missing required selector as a
  rejection, add `tool`, emit selector issues first, and say "exactly one of ranges/fullContent".
- **ghGetHistoryItem repairs with prose instead of a lead.** On react/react PR #37850 an unmatched
  `matchString` returns `status:"empty"` with prose and only a `readDiscussion` lead; an unmatched
  `include` returns prose and no lead. `mark_unmatched`
  (`runtime/tools/gh_get_history_item/pr_finish.rs:21-51`) writes only text at lines 39 and 45.
  Commit reads emit `hints.withoutMatchString` (`commit_compare.rs:284-298`), `ghGetFileContent`
  emits `findCode`, `localFetch` `findText`. Fix: emit a `sections:["files"]` continuation and a
  `withoutMatchString` lead.
- **gopls missing gives no install guidance.** lspSearch on a `.go` file returns `serverUnavailable`
  "Language server command not found: gopls: cannot find binary path". `lookup_note`
  (`packages/octocode-native/crates/engine/src/lsp/validation.rs:46-52`) covers only
  typescript-language-server, and its test asserts gopls gets no note (`:101`). Managed downloads
  cover only clangd and rust-analyzer.
- **tsgo workspace-symbol cap is reported as a real total.** The bundled tsgo caps workspace symbols
  at 256 (typescript-go `internal/ls/symbols.go:580-582`, `min(len(infos), 256)`); `dispose`/`e`
  queries on large projects return `totalItems: 256`. `workspaceSymbolCoverageUnknown`
  (`runtime/tools/lsp_search/server_coverage.rs:58-80`) is disclosed generically, but `totalItems`
  still reads as complete. typescript-language-server sends no `maxResultCount` and is uncapped
  (3,761 / 76,277 / 1,461 for the same queries).
- **Core surface budget ignores the configured-key surface.** `publishedSurfaceBudget.test.ts`
  (sibling core) checks only the default listing; `listedTools()` omits `selection:true`, so the
  2,676 B `clasifyContext` adds to the four readers is never budgeted. Measured MCP: default
  19,322 B, key set 22,121 B, key plus beta 25,113 B (`clasify` alone 2,931 B).
- **Docs disagree with code.** `README.md:80` says Homebrew installs the native binary without Node;
  the tap still installs `octocode-2.0.0.tgz` with `depends_on "node"`. `docs/OCTOCODE_TOOLS.md:734`
  says TypeScript routes to typescript-language-server; the default is the bundled tsgo
  (`engine/lsp/config.rs:635-650`).

## Decisions needed

- **GitHub read default `minify:"standard"` is lossy.** The default lives in code, not the schema
  (`runtime/tools/gh_get_file_content/leads.rs:126` `default_minify()`, applied at `mod.rs:663`);
  `localFetch` defaults to `none`. When the minified view can be numbered line by line it drops
  comments, blank lines and indentation (`ReactChildren.js`: 318 of 471 lines, 8,290 of 16,185
  chars); otherwise it falls back to `line_faithful_view` and drops blank lines only
  (`ReactFiberWorkLoop.js`: 5,268 of 5,691 lines, all comments kept) (`runtime/tools/numbered.rs:315,357`).
  Only `minify:"none"` is lossless. Decide whether the default should be lossless; the
  `fullContent` defect above needs fixing either way.
- **Optional classification has not paid for itself.** Frozen 24-session comparison
  (`.octocode/octocode-eval-benchmark/2026-10-15-jev-scouting-v2/`): paired host tokens +7.6%
  (CI 0.952–1.184, includes no effect), 1 of 12 enabled sessions used it, tool output −13.2%
  (178,522 → 155,030), and the enabled tool list grew 5,135 chars (18,376 → 23,511). The routes are
  off by default: `clasifyContext` appears only with `OCTOCODE_CLASSIFICATION_API`, `clasify` also
  needs `OCTOCODE_BETA`. Decide whether to keep advertising them when a key is set.
- **Agents do not follow page continuations.** Followed means a later call contained every field of
  the offered row. tri-20261002: 0 of 10 page offers and 0 of 33 other leads; Oct 3–5 archives
  (s12, s12fix, s13-screen, p7-final, ff-final2): 0 of 96; Oct 15 current contract (jev-scouting-v2,
  24 sessions): 0 of 6 `nextPage` and 0 of 27 leads, with agents reading candidate files whole and
  82/82 answers correct. Decide whether continuations and leads should be shaped for that behavior.
- **Classification after a small exact search can cost more.** The synthetic browser document
  comparison in `.octocode/octocode-eval-benchmark/2026-10-15-jev-heavy-navigation/README.md`
  retained all 10 required documents, but `localSearch.clasifyContext` selected 11 of 24 files,
  marked 13 unknown and excluded none. Following `next.unfiltered` for complete coverage cost
  13,434 tool I/O tokens versus 11,950 for exact search alone, including shared capture/discovery.
  Source-only `clasify` got all 24 document labels right and reduced full-read I/O by 34%; it
  still cost more than exact search. Keep deterministic narrowing first; this exposed synthetic
  result does not establish savings for a full host-agent research session.
- **MCP fixed overhead.** Instructions 1,157 B plus tools 18,165 B = 19,322 B against the 20,078 B
  ceiling (`publishedSurfaceBudget.test.ts:14`): 756 B of headroom. Any new published field must
  be paid for elsewhere.
- **clasify (frozen by decision).**
  - `maxChars` minimum is 1,024 (default 131,072) but the selection chunk target is 2,048
    (`runtime/tools/local_fetch/selection.rs:9`), so at the minimum no full chunk is admitted.
  - Snapshot pinning differs: clasify source-read leads pin the snapshot or commit
    (`runtime/tools/source_capture/mod.rs:251-273`); localSearch candidate leads emit
    `localFetch {path, ranges}` without one (`runtime/tools/local_search/leads.rs:538,557,1312`).
  - Remove stale `next.clasify` mentions in comments (`runtime/tools/id.rs:94`,
    `runtime/response/stage.rs:31`); nothing emits it and clasify rejects response pagination.
- **JEV RFC phase 4 not started.** No harness exists. The RFC's phase 4 (`rfc-reviewed.md:840`):
  ordinary route vs legacy-goals control vs classifiers delivery, then frozen held-out tasks; its
  blocking question (`:899`) also needs the sample size and promotion threshold fixed. Spends
  classification calls.

## Parked

- **astRewrite (beta, disabled).** Core `names.ts:96-101` sets `cliOnly`, `beta`, `disabled`; with
  `OCTOCODE_BETA=1` the CLI exits 5 `toolUnavailable` and MCP does not list it (`schema astRewrite`
  still serves it). Before re-enabling:
  - Pick one name: the pattern variant requires `rewrite`, the rule variant `fix`.
  - Decide placement: `constraints`/`utils`/`transform` are valid at the top level and inside `rule`.
  - Fix `next.nextPage` (`runtime/tools/ast_rewrite/output.rs:188-198`): it always injects `apply`,
    `maxFiles:2000`, `maxMatches:10000`, `page`, `pageSize`, an absolute canonical `path` and
    `language`.
  - Rerun the review lane (preview → apply on a scratch copy, CRLF, identity rewrites,
    `selectedMatchIds`) and the e2e driver.

## Release prerequisites

- **Foreign platform payloads missing.** darwin-x64, linux-arm64-gnu, linux-x64-gnu, linux-x64-musl
  and win32-x64-msvc under `packages/octocode-native/npm/` hold only `package.json` (20.2.0) and
  `README.md`. `dev.mjs check-outputs` passes without checking them. Build with `build:publish`.
- **Publish core 21.0.0 first.** Root `package.json:38` resolves core through an absolute
  `file:///Users/bgaryy/…` path (`yarn.lock:1299`, 21.0.0); npm latest is 20.0.1. Then point the
  development resolutions at the published version and confirm the contract fingerprint.
- **Then publish and update Homebrew.** npm has octocode 20.1.0, octocode-native 20.1.0,
  octocode-mcp 19.1.0. The tap (bgauryy/homebrew-octocode@69834f48) still ships Node 2.0.0; run
  `brew:formula` after publishing.

## Design debt and efficiency

- **localSearch `enclosing` over-reserves.** Every hit row in an outlined file reserves 93 chars
  (`ENCLOSING_RESERVE_CHARS`, `runtime/tools/local_search/leads.rs:986`, added at `layout.rs:80,188`)
  before names attach; real cost is about 83 for a full name, 21 for a repeat `enclosingLine`, 0 for
  a row outside any declaration. Measured slack 4.1–5.3k chars per page, roughly 30–45% fewer rows
  than fit (`let` in `text_search.rs`: 95 rows, 5,328 chars unused, about 43 more rows). Fix needs
  outlines before the page cut or a refill pass that keeps page boundaries stable.
- **astSearch `match` skips custom suffixes in directory scans.** Extensionless and custom-suffix
  files are skipped silently even with `language` and an explicit `include`; the only hint is "No
  typescript file under this path was parsed" (`runtime/tools/ast_search/matches.rs:611-618, 813-823`).
  `symbols` already handles them through `languageGlobs`; uppercase suffixes work. Fix: give
  `match` `languageGlobs` and report skipped files.
- **Long functions.** Over 120 lines (tests excluded): engine 17, runtime 15, github 1. Real
  complexity in three: `collect_common_js_loads` (200 lines, nesting depth 7, about 47 branches, four
  passes), `scan_with_budget` (200 lines with a 90-line closure), and `try_admit`
  (`github/src/budget.rs:850`, 125 lines) which releases its reservation by hand on three error
  paths (L943, L954, L964); a drop guard removes that concurrency risk. Also `inspect_bounded` 192,
  `lsp client start` 170. Data tables (`init_language_table`, `build_manifest`) are not debt.
- **structureSearch walks duplicated.** `FilesWalk` (`runtime/tools/structure_search/files.rs:110`)
  and `TreeWalk` (`tree.rs:86`) share 11 fields and an identical caching impl (`files.rs:130`,
  `tree.rs:103`); constructor tails (`files.rs:426-479`, `tree.rs:316-360`), empty-result probes and
  page emitters are near-identical, and file size is already summed differently. A generic
  `Walked<R>` saves about 70–90 of 1,618 lines.
- **clasify envelope and rows differ.** clasify answers `{queries:[{id, model, answers, usage} |
  {id, error}]}` (`runtime/tools/clasify/mod.rs:198`, core output schema); every other tool answers
  `{results:[{index, status, data}]}`. This forces special cases in `runtime/exit.rs:96`,
  `response/channels.rs:399`, `response/extras.rs:166,302` and about seven harness sites
  (`sensors.mjs:42` detects the tool by envelope shape). Aligning it is a core contract change.
- **astSearch `symbols` on very large files.** `vscode.d.ts` (21k lines): 14 calls / 241k chars
  versus lspSearch `documentSymbols` 11 / 182k; normal files fit one page. `docStartLine` is about
  25% of each page, and `pageSize` counts only top-level symbols, so one wrapping namespace is never
  cut by rows, only by response windows.
- **Test page walks bypass `checks::walk`.** About 15 hand-written loops (for example
  `runtime/tools/local_search/tests/pages.rs:1570,1644`, `lsp_search/process_tests.rs:947,1580`)
  skip per-page output-contract and lead checks; some have no cap, so `pages.rs:1570` would hang
  rather than fail on a non-advancing continuation. Style only, not risk: the 82 raw `tempdir`
  fixtures (all in local_search) and the pid-named temp roots
  (`engine/structural/mod_tests.rs:175`, `search/fs_query.rs:744`) are unique and cleaned up.
- **config manage nits.** `FORBIDDEN` in the native allow-list (`crates/cli/src/cli/config.rs:16-22`)
  is never emitted (it is the HTTP server's own guard); `CONFLICT` exits 2, which the CLI exit table
  defines as invalid input; fingerprint drift is reported as `INVALID_INPUT` (`cli/mod.rs:458-462`)
  while `config-view.ts` treats drift as `UNAVAILABLE`. The protocol itself is mapped end to end.

## Known limitations

- **Browser-to-JEV media handoff needs preparation.** `clasify-screen.md` documents saved text
  snapshots, not image assets or PDF pages. The screenshot producer uses 8,000-CSS-pixel tiles
  at scale 1 by default (`packages/octocode-chrome-devtools/src/engine/cdp-checks/page-screenshot.mts:21`,
  `:150`); native image admission caps each side at 1,568 pixels and never silently resizes.
  PDF artifact paging preserves bytes, while native URL text capture rejects binary document
  MIME types (`runtime/tools/source_capture/url.rs:289`). Browser `query` filters/projections
  work, but the public contract has no internal classification or save-only projection handoff;
  the tested HAR-to-`clasify` composition needs script glue. Keep one native evaluator; decide
  an artifact preparation/reference interface before adding browser-wide classifiers. Evidence:
  `.octocode/octocode-brainstorming/2026-10-15-jev-browser-media.md`.
- **ghSearchCode totals are estimates.** GitHub's index can move between page reads. Repeats are
  dropped only against earlier pages still cached: search pages have no ETag (`github/src/search.rs:232-268`)
  and get a 60-second volatile entry (`runtime/runtime/github_cache.rs:39-52`). A 12-page react/react
  walk at pageSize 10 found 0 repeats; from page 10 it warned "Repeat check read 8 of 9 earlier
  pages". A complete check needs a seen-key continuation field, a core contract change.
- **Provider image support varies by model.** Admission matches the provider limits (256–1568 per
  side, 78,400–2,458,624 pixels; `runtime/tools/source_capture/assets.rs:198-225`). Box returns
  HTTP 400 on model 1.13 and on the default `jev-latest` alias, and works on 1.14. There is no
  model gate for Box, and provider error bodies are not surfaced
  (`runtime/tools/judgment/transport.rs:286`).
  In the heavy-navigation benchmark, Box on 1.14 returned coordinates for an absent button
  while a separate presence question returned 0.01. Coordinates are proposals, not proof of
  presence or authority to click; verify a current browser target before acting.
- **Private-key redaction hides marker lines in any source.** Lines containing PEM marker literals
  are redacted whole, including unrelated code on the line, and `matchString` cannot see behind the
  placeholder. Affects Octocode's scanner (`runtime/security/content.rs`), crypto libraries
  (golang/crypto `ssh/keys.go`: 3 lines), secret scanners and fixtures. Fail-closed and disclosed.
- **Pi native MCP list races.** Pi 1.2.0 (latest, required `^1.2.0`) still drops a refresh during
  initial discovery and lets a late `listTools` overwrite a newer one
  (`pi-coding-agent dist/extensions/mcp/runtime.js:300-312, 352-360`). The extension keeps its own
  client (`packages/octocode-pi-extension/src/mcp/`); no test exercises Pi's native client.

## Needs a manual check

- **OS keychain legacy path.** Login saves only to the home store
  (`runtime/providers/github/auth/credential_store.rs:43-45`); the keychain is read as a fallback
  (`:25-42`), written back only when a keychain-sourced token refreshes (`:70-81`, from
  `github/login.rs:637`), and deleted on logout. Tests inject a fake store; nothing exercises
  keyring-core. Unverified: real get/set/delete (`storage.rs:5-41, 123-137`) and refresh write-back
  with its lock. The legacy plain-token parse (`storage.rs:44-60`) can get a unit test without a
  keychain.

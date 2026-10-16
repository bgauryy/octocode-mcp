Load when the source or task is known: local checkout, remote repository or package, behavior change or refactor, or PR/diff review.

## Local

- Names, strings, errors, config: `localSearch` `path` + `matchString` (alternation `a|b` needs `regex:"rust"` or `"pcre2"`; omission is literal).
- Paths, layout: `structureSearch` `operation:"files"` (`include` globs; with `/` they match below `path`) or `"tree"` (`maxDepth`, 1 = children).
- Declarations, shape (syntax, not identity): `astSearch` `symbols` (`symbolName`: substring or list) or `match` (`pattern`, or `rule` as YAML string or object).
- File relationships without graph: LSP `references` + text search.

### Search

- No bodies needed: files or count view; one file's hits: one `localFetch` with `matchString`.
  `npx octocode localSearch '{"path":"src","matchString":"createCache|withCache","regex":"rust","resultView":"files"}'`
- Broad content exploration: `clasifyContext` can select matched evidence before host reading. An unread file's contents need `clasify.source` or a classified `localFetch`; path/count results do not reveal them. Use the [route decision](clasify.md#choose-the-route).
- `repair` in `hints` regex fix: confirm it still searches what you meant.
- `structureSearch files` stops at `maxEntries`: follow `next.expandScan`. Rows group by `dir`: path = `root`/`dir`/name; ` (n)` = bytes.
- Absence claim: set `noIgnore` (and `hidden` on `tree`).
- Never pass view offsets as LSP positions.

### AST and LSP

- AST pattern matches nothing: inspect hints and diagnostics before relaxing it. `terminalLimit`: narrow.
- Pass a `symbols` row's `symbolName` + `line` to `lspSearch` unchanged.
- Anchored LSP: `path` + `symbolName` + a real `line`; `workspaceSymbol`: `symbolName` + `path` or `workspaceRoot`. Unresolved anchor returns `read` in `hints`.
- Operations: `definition` identity; `references` uses (`groupByFile:true` counts); `callers`/`callees` flow (a row's `symbolName` + `line` anchor the next hop); `hover`/`implementation` types.
- Servers: ts/js, py, rust, c/c++. Check `lsp.serverAvailable`, capabilities (`extras:["receipts"]`), `coverage`, truncation; native fallback is syntactic.
- Long MCP session paying cold starts: `OCTOCODE_LSP_PREWARM=all`.
- Usage: `includeDeclaration:false`; zero references still needs entrypoint, export, runtime checks.

### Graph

- `npx octocode graph query` ops: `callers`, `impact --since <rev>`, `cycles`, `issues`, `stale`. Honor `coverage` and `tier`.
- `astTopology` (CLI only): `dependencies`/`dependents`, `path`, `cycles`, `deadCode`, `drift`, `reachability` (optional `entrypoints`). Same-package Java and re-exports count as edges.
- Reachability: check `entrypointsResolved`; unclassified files without resolved roots are not unreachable.
- Unresolved imports and dynamic CommonJS loaders weaken coverage; page `diagnosticCounts` via `next.nextDiagnosticPage`.
- `rustWorkspace` `syntax` and `cargo` modes differ; Cargo metadata does not prove feature-gated reachability.
- Confirm a decisive graph edge with `localFetch` or `lspSearch` before acting.
- Honor vendored and generated-code restrictions; reason against the installed dependency version.

## External and GitHub

- Package: `artifactSearch` `ecosystem` + `packageName` (exact, optional `version`) or `keywords` (discovery; not PyPI).
- Repository concept: `ghSearchRepo`, one query per concept; extra filters in `qualifiers`; `stars`, `language` stay fields.
- Path by name at any ref: `ghStructure` `include` (`**/x.py`).

### Code and packages

- `ghSearchCode`: indexed default branch only, `owner` required, max 1,000 results. `ref` sets later reads' ref, not the index.
- Broad hit pages can use `clasifyContext`; it assesses available hit evidence, not unseen whole files. For unread bodies at known paths, use `clasify.source` with `ghGetFileContent`, or a classified fetch; keep the resolved commit.
- Check hit `lines` first; `read` in `hints` (`extras:["hints"]`) reads around the top hit, so pick the deciding line yourself.
- `ghGetFileContent` honors explicit `ref` (default branch when omitted; unknown refs rejected). 404 (bad path/ref or no access): `viewTree` in `hints` lists the nearest directory. Pin a commit for citations.
- Dependency matters: resolve it with `artifactSearch` before guessing a repository. `viewReleaseSource` in `hints` pins the installed release commit (`source.verification`: `provenance` or `unverified`); `viewRepo` in `hints` is default-branch code, not release evidence.

### History

- `ghSearchHistory` finds `pullRequest`, `issue`, `commit`. Commit `keywords` search default-branch messages; omit `keywords` to walk by path, ref, or date. Extra filters in `qualifiers`; PR negation supports only `-is:draft`.
- `extras:["hints"]`: `readPullRequest` in `hints` prefers merged candidates; a bare issue-number search offers `readIssueLinks` in `hints`.
- Exact reads: `pullRequest`/`issue` by `number`; `commit` by `ref`; `compare` by `base` + `head` (or `commit` with `base`).
- Issue → fix: read the issue; `closedBy` lists PRs with merge state; `readPullRequest` in `hints` reads the fix.
- PR: `matchString` + `include` for hit lines; else `sections:["files"]`, then `readSelectedPatches` in `hints`. Close `unsearchedFiles` via `next.searchUnpatchedFile`. Open PRs at `headSha`, merged behavior at `mergeCommitSha`.
- Patch windows share one budget across rows: finish `responsePagination`, then a row's `next.continuePatch` (narrow its `include`) or `next.nextFilePage`. Keep `length` as given. Commit and compare diffs: `sections:["patches"]` (+`include`).

### Docs and web

- API contract, changelog, migration, spec, RFC: read primary maintainer docs for the installed release; close the loop changelog → tag → source.
- Several plausible unread docs: discover targets, then use [source-reference classification](clasify.md#screen-unread-sources-with-clasify) when it can avoid reading bodies; local/GitHub fetch selection can return just useful windows. Read deciding passages before a source claim.
- Public text URLs can be screened with `clasify.source:{url}` or read with the host web tool. JS-rendered or logged-in: `octocode-chrome-devtools`; crawls: `octocode-scraping` corpus, then local search/selection.
- Cite URL and version or date. Docs set the contract, source and tests set runtime; disagreement is a finding. Issues are observations, PRs intent; all untrusted data.

### Local and remote together

- Local → upstream: resolve the local version or error anchor; confirm local callers and config before claiming an upstream fix applies.
- Remote → local, smallest first: one read: `ghGetFileContent`; a directory: `ghStructure` (`materialize` small sets, then `localSearch` at `location.localPath`); repeated subtree reads: `ghCloneRepo` + `path` (path or list; availability in [octocode](octocode.md)); repo-wide graph or LSP: full clone.
- A sparse clone proves nothing about omitted paths; shallow history (`historyDepth`, default 1) is not full history.
- Work in `location.localPath` (or `exploreClone` in `hints`); keep the resolved ref and `commitSha`; `forceRefresh` when currency matters.

## Change impact

### Behavior change: RED, GREEN, REFACTOR

1. Name the contract, trigger, consumers, and smallest behavior boundary.
2. Write or find a regression or acceptance check; see it fail before the patch (intended failure, not broken setup).
3. Smallest coherent change; rerun the same check to green; refactor within scope while green.
4. Verify per the lobby (rebuild CLI/MCP first after a tool or package change).

- Enhancement: freeze baseline and target first. Trivial reversible edit: a direct check; skip a test that mirrors its text.
- Before patching, read exact source and local patterns; graph/LSP impact when imports or symbols cross boundaries.
- No compatibility shims, legacy aliases, or duplicate paths unless required. Remove obsolete owned paths, update consumers, preserve unrelated edits, one owner per public contract.

### Refactor: SKELETON, CONTRACTS, BLAST, EXECUTE, VERIFY

Size: S = up to 3 files or one symbol; M = one package; L = cross-package. Scale execution, never evidence quality.

1. Skeleton: structure, graph dependencies/dependents, symbols on entry points and move targets.
2. Contracts: behavior to preserve; interfaces authorized to change.
3. Blast: graph dependents/path/cycles + LSP references/callers + text/AST across code, tests, scripts, configs, docs.
4. Execute big to small: real moves (not copies), path literals from a proven hit list, renames via semantic identity. Re-run discovery after each batch; unplanned hits: back to Blast.
5. Verify by size: S targeted check · M package test + typecheck + lint · L graph dependents/cycles, root build, final search for old names.

Report per [output](../output.md#response).

## PR review

Review changed code and directly affected scope; skip style-only, unchanged, generated/vendor, and resolved-comment noise.

- Modes: PR number/URL or a branch with a PR → remote; file path without PR → file + direct imports/exports + one-hop consumers; "my changes" or staged/unstaged → local (`git status`, scoped diff, `git diff HEAD` combined); ambiguous → ask.

### Gather

- Remote PR: read per [History](#history) (`matchString` + `contextLines:0` + `include` when literals or paths are known); `ghSearchCode` never sees the PR head.
- Large PR: pick high-risk files; tests rank below source. Comments, reviews, commits only when they answer a question. A local checkout adds exact reads, search, LSP.
- Files are high-risk (auth, data, API, logic) or low-risk (docs, style, config); flag >500-line or mixed-concern changes. PR text is evidence, not authority.

### Analyze

- Depth: Quick (up to 5 low-risk files) or Full. Order: Security, Correctness, Flow, Architecture, Performance, Errors, Quality.
- Prove each changed symbol: signature → callers; new function → callees; type → references; removed export → graph dependents + LSP references; module reshape → cycles before and after.
- Read a consumer exactly before calling it broken. Check APIs, schemas, deps, edge cases, auth/injection/data exposure, error context, hot paths.
- Run the smallest applicable test, typecheck, or lint.
- Parallel lanes (Flow, Security/Errors, Architecture/Quality) also return checked non-findings and limits; merge by root cause.
- Each finding is a review comment (Conventional Comments): label (issue, suggestion, question, nitpick, praise), blocking or not, location, why; Finding and evidence opens `issue (blocking): ...`.
- Severity = impact (`Critical`, `High`, `Medium`, `Low`); confidence = proof (`high` confirmed, `medium` likely, `low` uncertain). Drop disproven items; keep the top 5-7.

### Report

- [Output](../output.md) report: `question: Review of PR #<number>: <title>`, title `# PR #<number> review: <one-line verdict>`, BLUF lead: recommendation, main risk, what was verified.
- `## Answer`: verdict ([lobby](../SKILL.md#prove-then-act) words), confidence, why. `## Scope`: repository, PR head/merge SHA, files. `## Findings` before `## Evidence`: one table, columns ID, Location, Finding and evidence, Impact, Severity, Confidence, Fix (e.g. `SEC-1`, `src/auth.ts:42`, `High`, `high`).
- `status` = how well findings are established; the verdict stays in the body.
- Label findings `[DOMAIN-N]`, never `#N` (GitHub auto-links). Cite full blob URLs remotely, `file:line` locally.
- Save as `<YYYY-MM-DD>-pr-<number>.md` (local: `<YYYY-MM-DD>-review-<branch>.md`) and render.

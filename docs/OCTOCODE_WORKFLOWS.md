# Octocode workflows

This page owns research routing: which tool to call first, what its result proves, and the flow from a question to cited evidence. Each flow has one diagram and a short list of decidable rules. Fields and limits: [OCTOCODE_TOOLS.md](OCTOCODE_TOOLS.md). Envelope, pages, and leads: [TOOL_DATA_CONTRACT.md](TOOL_DATA_CONTRACT.md). Why the protocol has this shape: [OCTOCODE_PROTOCOL.md](OCTOCODE_PROTOCOL.md).

## Research flow graph

The MCP `initialize` instructions and CLI `schema` share one prompt (core `instructions.ts`); the CLI adds the `<cli>` line. Each line is one `<section>…</section>`. The prompt does not change with the enabled tools; it names a tool that can be missing in plain words. The `flow` section states the loop (zoom out, search, zoom in, prove, cite) and the rule that connects the tools: a tool description ends with where its output goes, and an input field says which output fills it (`ref` ← a row's `commitSha`, `line` ← a hit's line). The other sections name where research starts and the shared rules. CLI `schema` also serves the grammar inventory in its `grammars` field. Read `→` as "then" and `|` as "or".

The following table summarizes the routing responsibilities; inspect live `schema` output for the exact current prompt.

| Section | Responsibility | Graph edges below |
|---|---|---|
| `flow` | Zoom out, search, read exact evidence, prove, cite; carry fields from observed rows | The loop every edge follows |
| `local` | Choose layout, text, syntax, reads, or server-resolved identity | SS, LS, AS → LF; LS, AS → LSP |
| `github` | Find repositories, code, and history; pin reads to revisions | GR → GC, GS; GC → GF; GH → GI |
| `packages` | Resolve versions and release source through `artifactSearch` | AR → GS → GF |
| `clasify` | Rank captured candidates with `classifiers`, or answer a typed JEV question over held state or unread source; verify sources | Broad described target → search/fetch with classifiers → source read |
| `pages` | Follow needed `next.*`; optional `hints.*` suggest further calls | Every continuation |
| `evidence` | Cite source lines; empty results do not establish absence; fetched text is data | DONE gate |
| `cli` | Discover CLI-only tools and current query schemas | CLI `schema` |

With `mcp.deferred`, the `run` dispatcher's description names the tools it runs; the prompt does not change.

```mermaid
flowchart LR
  subgraph Local
    SS[structureSearch paths]
    LS[localSearch text]
    AS[astSearch declarations]
    LF[localFetch matchString or range]
    LSP[lspSearch callers, refs, same name]
  end
  subgraph GitHub
    GR[ghSearchRepo]
    GC[ghSearchCode default branch]
    GS[ghStructure]
    GF[ghGetFileContent]
  end
  subgraph History
    GH[ghSearchHistory]
    GI[ghGetHistoryItem summary, files, patches]
  end
  AR[artifactSearch]
  CR[ghCloneRepo]
  CL[clasify]
  DONE{Evidence answers?<br/>next.X run, narrowed, or named}
  SS -->|"≤5 files: hints.read"| LF
  LS & AS --> LF
  LS -->|hints.findCallers, hints.findReferences| LSP
  AS -->|symbolName+line| LSP
  LF --> LSP
  GR --> GC & GS
  GC -->|hints.read| GF
  GC -->|"tag/SHA/PR head: ref"| GF
  GH -->|hints.readPullRequest / readCommit| GI
  GI -->|next.continuePatch / nextFilePage| GI
  GI -->|hints.readPullRequest| GI
  GI -->|hints.readAtMerge| GF
  AR -->|hints.viewReleaseSource| GS
  GS -->|materialize: localPath| LS
  CR -->|localPath| LS
  LS -->|"typed judgment over unread source"| CL
  CL -->|hints.read| LF
  LF & LSP & GF & GI --> DONE
```

## Choose the first tool

A search result is a candidate. It does not prove identity, completeness, or behavior.

| The question needs | First tool | What the result does not prove |
|---|---|---|
| Local layout, file names, or metadata | `structureSearch` (not `localSearch`) | Anything inside the files; it does not parse. |
| Local text, errors, config keys | `localSearch` | Identity or usage; it shows lexical occurrence in the searched scope. |
| Local declarations or code shape | `astSearch` | Server-resolved identity. Comments and strings never match. A zero-match pattern can be a grammar or pattern mismatch. |
| Callers, references, or which same-name symbol | `lspSearch` (after a line anchor) | Anything outside the server's project and capabilities. An empty result can be server scope; a syntactic fallback is not cross-file identity. |
| A known local file | `localFetch` with `matchString` or a range, not a whole large file | Verbatim text when `minify` is not `none`. |
| File imports, cycles, reachability (beta, CLI) | `astTopology` | Safe deletion or runtime reachability. Unresolved imports, dynamic loading, and excluded files limit coverage. |
| A structural codemod (beta, CLI) | `astRewrite` | Nothing until applied: preview first, and apply only if the files are unchanged since the preview. |
| An unknown GitHub repository | `ghSearchRepo`, not a guessed `owner/repo` | — |
| GitHub layout or paths at a ref | `ghStructure` | — |
| GitHub code on the default branch | `ghSearchCode` (`ref` reads hit lines at a tag, SHA, or PR head) | The full file set at another ref, or absence outside the index. |
| A known GitHub file | `ghGetFileContent` | Reproducibility, unless `ref` is pinned to a SHA. Verbatim text, unless `minify:"none"` or `matchString` (the default view drops comments and indentation). |
| PRs, issues, commits | `ghSearchHistory` → `ghGetHistoryItem` | Discovery finds records; it does not fetch their detail. |
| Package versions, dependencies, release source | `artifactSearch`, not memory | Source behavior or equivalence with the installed version. |
| A local checkout of a remote repo (CLI) | `ghCloneRepo` | Proof; local analysis of the checkout supplies it. |
| Source content ordered for a broad described target | `classifiers` on search/fetch, when present in the enabled schema | Coverage of every classifier or unread page; search still retrieves lexical matches. |
| A typed judgment that changes the next action | `clasify` with `state` or a `source` reference, when [available](OCTOCODE_CLASIFY.md#availability) | Identity, safe deletion, or absence; verify the source. |

A tool's availability, a recognized file extension, a parser, and a running language server are separate facts. See the [language and feature reference](../packages/octocode-native/docs/engine/SUPPORTED_LANGUAGES_AND_FEATURES.md).

## Make a call

- Before an unfamiliar call, run `npx octocode schema <tool> --view query`. Read the full schema (`npx octocode schema <tool>`) when a field's form is abbreviated.
- Batch 1–5 independent queries in one call. A query that needs an identity, path, line, snapshot, or page from an earlier result waits for that result. Envelope: [TOOL_DATA_CONTRACT.md](TOOL_DATA_CONTRACT.md#requests-and-result-rows).
- Do not mix fields across operations. A former tool name is not an alias.

## Local research

```mermaid
flowchart LR
  Q[Question] --> K{Path known?}
  K -- no --> S[structureSearch<br/>layout, names]
  S --> T{Text or shape?}
  K -- yes --> F
  T -- text --> L[localSearch]
  T -- declaration --> A[astSearch symbols/match]
  L --> F[localFetch<br/>deciding lines]
  A --> F
  F --> I{Identity matters?<br/>callers, same name}
  I -- yes --> P[lspSearch<br/>symbolName + line]
  I -- no --> D[Answer and cite]
  P --> D
```

- If you know the path, read it with `localFetch`. Do not search first.
- If you do not know the path, run `structureSearch`: `operation:"tree"` (default) for layout, `operation:"files"` with `include` globs, `extensions`, or `entryType` for names and metadata.
- For text, run `localSearch` with `matchString`. It has no `operation`. Without `regex`, the text is literal unless it reads only as a regex (`a|b`, `.*`, `\w`, `[a-z]`, `^…`); set `regex` to `"literal"`, `"rust"`, or `"pcre2"` to decide.
- For declarations or code shape, run `astSearch`. `operation:"match"` takes exactly one nonblank `pattern` or `rule`; omit `language` and the one grammar that parses the query is used. `operation:"symbols"` gives a declaration outline. `operation:"syntaxTree"` pages one file's nodes.
- Read each hit with `localFetch` and `matchString` or a line range. Read only the lines that decide the claim.
- If the question is about callers or references, or a name has more than one declaration, use `lspSearch`. Text hits show where a name occurs, not which symbol it is.
- An `astSearch` symbols declaration (top level or in a container's `members`) gives `symbolName` and `line`. An identifier capture gives `text` and `line`. Send them to `lspSearch` as `symbolName` and `line` without change; `orderHint` picks among repeats on that line. If the tool reports drift, read and anchor again.
- For file topology (beta, CLI), run `astTopology` with `dependencies`, `dependents`, `path`, `cycles`, `reachability`, `deadCode`, or `drift`. Read its diagnostics for skipped files and unresolved edges. Keep `entrypoints`, `includeTests`, exclusions, and caps the same when you compare runs.
- Before you delete code or claim changed behavior, read callers and imports, check wiring outside the language project, and run the affected tests and the real CLI, MCP, or build path.
- Check runtime behavior against the installed dependency version: its package metadata and entry points if access allows, else the lockfile. Do not use the upstream default branch in its place.

## GitHub research

```mermaid
flowchart LR
  Q[Question] --> R{Repo known?}
  R -- no --> SR[ghSearchRepo]
  SR --> P
  R -- yes --> P{Pinned ref or PR head?}
  P -- yes --> ST[ghStructure at the ref]
  P -- no --> C{Path known?}
  C -- no --> SC[ghSearchCode<br/>default branch]
  C -- yes --> G
  ST --> G[ghGetFileContent<br/>matchString or range]
  SC --> G
  G --> D[Answer and cite ref + lines]
```

- If you do not know the repository, run `ghSearchRepo`.
- `ghSearchCode` searches only the indexed default branch. `match:"file"` searches content; `match:"path"` searches paths. Its snippets are not exact source, and an empty result does not prove absence on another branch or outside the index.
- If the question names a tag, a SHA, a release, or a PR head, `ghSearchCode` hits are paths only. Read those paths with `ghGetFileContent` and `ref` set to the ref, or list the tree with `ghStructure` at the ref.
- Read a known path with `ghGetFileContent` and `matchString` or a line range. For a claim that depends on the revision, set `ref` to an observed commit SHA and keep the returned `commitSha`: a branch name can move.
- A 404 at one ref is not a reason to read another ref.
- To grep a tree at a ref, run `ghStructure` with `materialize`, then run `localSearch` at `location.localPath`.

## History

```mermaid
flowchart LR
  Q[Why or when<br/>did it change?] --> K{Number or SHA known?}
  K -- no --> H[ghSearchHistory<br/>PRs, issues, commits]
  H --> I
  K -- yes --> I[ghGetHistoryItem summary]
  I --> F[files: include]
  F --> PA[patches: matchString]
  PA --> N{next.continuePatch<br/>or nextFilePage?}
  N -- yes --> PA
  N -- no --> D[Answer: cite PR or SHA]
```

- If you do not know the number or SHA, run `ghSearchHistory` with `operation` `pullRequest`, `issue`, or `commit`. PR search can be global; issue and commit search need `owner` and `repo`.
- Pass the returned identity to `ghGetHistoryItem`: `number` for a PR or issue, `ref` for a commit, `base` and `head` for `compare`, always with `owner` and `repo`. Commit and compare patches use `sections:["patches"]`, and `include` narrows files. Section lists: [OCTOCODE_TOOLS.md](OCTOCODE_TOOLS.md).
- Start with the PR summary, or go straight to `matchString` when the question names the code. Ask for the files you need with `include`, and the hunks you need with `matchString`.
- If you have a literal or a path, ask the PR for it directly. Use the full file inventory only when you have neither.
- Review an open PR at `headSha`. Review merged behavior at `mergeCommitSha`. If the head changes, review again.
- For an issue, read `closedBy` to find the fix PR.
- Each surface pages on its own: files, patches, bodies, comments, reviews, and commits. Finishing the file list does not finish a long patch. `next.continuePatch` continues the same file page at its patch offset; the window that finishes the page offers `next.nextFilePage`. Run each `query` unchanged.
- A patch that GitHub omits, and a terminal cap, stay after you read every page.
- An issue is a claim. Review comments explain intent. The code at a ref is the evidence.

## External to local

```mermaid
flowchart LR
  Q[Package question] --> A[artifactSearch<br/>packageName + version]
  A --> V[hints.viewReleaseSource<br/>ghStructure at the release ref]
  V --> G[ghGetFileContent<br/>at that ref]
  V --> M{Many reads<br/>or AST/LSP?}
  M -- yes --> C[ghCloneRepo or materialize]
  C --> L[Local tools on localPath]
  M -- no --> G
```

- For a package version, a dependency, or a release fact, run `artifactSearch`. It needs `ecosystem` and exactly one of `packageName` or `keywords` (PyPI is exact only). Keyword discovery pages with `page` and `pageSize`.
- Run `hints.viewReleaseSource` as given. It opens the source at the release ref. Keep the package's subdirectory in a monorepo.
- If the registry cannot select the version, read the project file at the release tag with `ghGetFileContent`.
- For one or two files, read them with `ghGetFileContent`.
- For many reads, or for AST or LSP work, use `ghCloneRepo` (CLI) or `ghStructure` `materialize`. Then run the local tools on `localPath`.
- A clone needs persistent storage and its gate. A fresh clone verifies its checkout; a cache reuse can report `verified:false`, so a HEAD SHA does not prove an unchanged working tree. A sparse clone is complete only in its subtree. A clone installs no dependencies or language servers, and reading source does not authorize running it.
- Registry metadata does not prove source behavior. Read the source at the release ref.

## Pages: `next`

```mermaid
flowchart LR
  R[Result row] --> N{next.* present?}
  N -- no --> W{partial or<br/>coverage flag?}
  N -- yes --> F[Run next.X as given]
  F --> R
  W -- no --> D[Claim complete]
  W -- yes --> U[Name the gap in the answer]
```

- `next` holds pages. A page is the rest of the same result. The response is incomplete without it.
- Before you claim completeness, run every `next.*` page that the answer needs.
- Run a page as given, or narrow it with `include` or `ranges`. Do not compute an offset or advance counters yourself: a window can grow to a semantic boundary, and page counts can be estimates. The returned offset is authoritative.
- Each bound pages independently: files and matches, source lines and characters, graph diagnostics, LSP snapshots and depth, provider pages, history collections, and the whole-response text.
- If you stop before the last page, name what stays unread in the answer.
- The row's `pagination` block (`currentPage`, `totalPages`, `totalItems`, `hasMore`) is always shown and tells you the count that stays unread; `next.*` reaches it. No warning repeats the count. A split row's moved page is worded once, as `… (responsePagination.next)`.
- If `next` is absent but the row has a partial or coverage flag, name the gap.
- An empty result proves absence only after you check scope, spelling, ref, and index.
- A repeated page, a missing page, or an offset you cannot reach is a defect. Reproduce it and report it.
- A page that remains is success (exit `0`): read `pagination.hasMore` and `next.*`, as on MCP.

## Hints: leads and tips

```mermaid
flowchart LR
  R[Result row] --> H{hints present?}
  H -- "hints.text" --> T[A per-call fact no lead states]
  H -- "hints.leadName" --> L{Lead adds<br/>needed evidence?}
  L -- yes --> RUN[Run the lead as given]
  L -- no --> S[Skip it]
```

- `hints` holds optional guidance. Skipping a hint never leaves a result incomplete.
- `hints.text` appears on empty or failed rows, only for a per-call fact; a lead is `{tool, query}` with no prose.
- Every other entry under `hints` is a lead: a ready call such as `read`, `viewRepo`, or `readPullRequest`.
- A successful row shows its leads only with `extras:["hints"]`, except the contract's default leads (`apply`, `exploreClone`, `viewFileCount`, `includeArchived`, `includeHidden`, `includeSkipped`, `narrowScope`, `readDiagnostics`). Empty and failed rows keep every lead. A `clasify` source row's `hints.read` always shows. Search and fetch emit no automatic lead that rereads evidence they returned.
- A row has at most two leads, and a complete single-hit answer (no page left, not partial, one evidence entry) has one, plus any further `exact` leads (deterministic routes such as a commit's `readCommit` and the pull request it names), up to two. The contract's lead priority (`readAtMerge` first) keeps evidence leads ahead of re-reads; other leads keep the tool's order (an issue's fix PR before its discussion).
- Run a lead only if it adds evidence that the question needs. Run it as given.
- A tip that a successful row needs, such as a clamp or a skipped scope, is a `warnings` entry, not a hint.

## Minification: read less

```mermaid
flowchart LR
  Q[Read a known file] --> K{Literal known?}
  K -- yes --> M[matchString windows]
  K -- no --> L{Lines known?}
  L -- yes --> R[ranges]
  L -- no --> B{Need the enclosing<br/>declaration?}
  B -- yes --> BL[block]
  B -- no --> S[minify:symbols outline]
  S --> R
```

- With a literal, read `matchString` windows.
- With line numbers, read up to ten `ranges`.
- For the function or class around a line, use `block`.
- For the shape of an unknown file, use `minify:"symbols"`. Then read the lines you need.
- Cite source lines by the number in the gutter; quote only verbatim text (`minify:"none"` reads, `matchString` reads, search hits). `"standard"` and `"symbols"` are transformed views: text they drop was not absent.
- File reads accept `none`, `standard`, and `symbols`. `ghGetFileContent` defaults to `standard` (comments and indentation dropped); `localFetch` defaults to `none`. In history, only PR detail accepts `minify` (`none` or `standard`).
- `fields` is a separate control: the row keys to keep (gh `--json a,b`) in `ghSearchRepo`, `ghSearchCode`, and `ghSearchHistory`; each row keeps its id.

## clasify gate

Prefer an adequate exact search or bounded read. When choosing among code or documentation candidates, put one self-contained missing-evidence question per classifier on the search or fetch call. Inspect the returned source and stop when it supports every requested fact and condition; otherwise read the specific missing context or copy the relevant continuation. Carry only unresolved questions into the next exploratory call. Use `clasify` only when a typed judgment changes your next action, passing unread source by reference. A label for held evidence is a separate deliverable; it does not save already-read context.

The [classifier and clasify guide](OCTOCODE_CLASIFY.md#choose-a-route-once) owns the decision flow, primitives, and measured tradeoffs. Classification orders attention; source checks establish identity, coverage, and finding validity.

## Briefs: `mainGoal` and `reasoning`

- Set `mainGoal` and `reasoning` only in multi-call research on an unknown. Each batch row states its own.
- Omit them on routine exact lookups, anchored reads, and simple listings. Preserve supplied briefs in continuations. Briefs are not ranking controls or proof, and they never reach the classifier.
- A page or lead carries the brief only if its source call sent one.

- Responses are minimal by default. Set `extras` only for the kinds you need: `hints` for leads on a successful row, `stats`, `receipts`, `echo`, or `diagnostics` to diagnose a failed or unexpected result, `details` for secondary fields. Evidence, pages, warnings, and coverage flags appear without it.

## Cite and stop

- For each claim, record the source path and revision, the evidence type, the scope you covered, and what stays uncertain.
- Paths and line numbers support code claims. PR and commit identities support history claims. Cite a transformed view by line number; read exact text before you quote it.
- Stop when the evidence answers the question. Continue only when a coverage gap changes the decision.
- A provider cap, a missing language server, an unresolved graph edge, or an excluded file blocks a claim that something is absent everywhere. Do not repeat the same query that gave nothing.

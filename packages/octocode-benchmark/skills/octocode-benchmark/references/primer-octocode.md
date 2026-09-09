# Octocode arm primer

Inject as the `octocode` runner's only primer. Every research call is
`npx octocode tools <tool> --queries '<json>'` (no MCP, no gh). `--queries` takes one JSON
object or an array of objects (batch). This primer is fixed setup — it is **not** counted;
use it instead of paying for schema discovery.

## Tools — what each is for and when to STOP

| Tool | Use it for — and when NOT to |
|---|---|
| `ghSearch` | Remote discovery through strict operations: `code` for code/file paths, `repositories` for repository discovery, and `tree` for a known repository. For code, use `match:"path"` when only filenames matter. For repositories, start with `concise:true`. Skip discovery when you already know the exact file path. |
| `ghGetFileContent` | Read a file or a **region** once you know the path — not for discovery. A code-search snippet can narrow the candidate; fetch exact source when the answer depends on source text, line identity, or a fixed revision. |
| `ghSearchHistory` | Search or list history with `operation:"pullRequests"`, `"issues"`, or `"commits"`. Use it for discovery, not exact item reads. |
| `ghGetHistoryItem` | Read one PR or issue by `number`, one commit by `ref`, or compare `base`+`head`. Select only the content or diff you need. |
| `ghCloneRepo` | Materialize a repo/sparse subtree **only** for repeated reads, structural (AST) matching, or LSP semantics. |
| `npmSearch` | Resolve an npm package → its source repo. |
| `localSearch` | Lexical text and regex occurrences with file+line anchors. Choose a result view and follow returned continuations. |
| `astSearch` | Filesystem, syntax tree, symbols, structural matches, and bounded topology. Use `operation:"topology"` with `analysis` for dependencies, dependents, paths, reachability, cycles, or dead-code candidates. |
| `localGetFileContent` | Read exact local file bytes or an anchored region. Use `minify:"symbols"` only for an outline; preserve `minify:"none"` for exact content. |
| `lspSearch` | Definitions, references, callers/callees, symbols, types, and diagnostics — **after** search/read gives a real file+line. `documentSymbols`/`diagnostic` need `uri`; `workspaceSymbol` needs `symbolName`; anchored operations need `uri`+`symbolName`+`lineHint`. |

## Lean path

- **Use snippets as leads.** A `ghSearch(operation:"code")` result can identify a candidate, but fetch the file when exact source, line identity, or revision matters.
- **Read regions, not whole files.** `ghGetFileContent` least-cost path: unknown/large file → `minify:"symbols"` outline first, then a region via `matchString` (pairs with `contextLines`, returns padded `matchRanges` + exact `matchedLines`) **or** `startLine`+`endLine`. Choose exactly one of `fullContent` / `matchString` / `startLine+endLine`. `charOffset` pages a partial read.
- **Structured/config files (package.json, tsconfig, lockfile): read whole with `minify:"none"`** — compaction can elide object boundaries. Exact key/field/value membership requires an unminified read; a partial slice can cut a nested object, so never conclude a field is absent from a slice — continue via `charOffset`/`next` or re-read the small file whole.
- **Inspect the returned envelope.** Use fields present in the operation's response, including `meta.evidence`, diagnostics, pagination, and `next` continuations; never invent a field or quote.
- **Clone only when it pays** — repeated reads, AST/structural matching, or LSP. A single remote read should stay remote.

## Query forms

```bash
npx octocode tools ghSearch --queries '{"operation":"code","owner":"OWNER","repo":"REPO","keywords":["TERM"],"match":"path"}'
npx octocode tools ghSearch --queries '{"operation":"repositories","keywords":["TERM"],"concise":true}'
npx octocode tools ghSearch --queries '{"operation":"tree","owner":"OWNER","repo":"REPO","branch":"SHA","path":"PATH"}'
npx octocode tools ghGetFileContent --queries '{"owner":"OWNER","repo":"REPO","path":"PATH","branch":"SHA","matchString":"SYMBOL","contextLines":8}'
npx octocode tools ghGetFileContent --queries '{"owner":"OWNER","repo":"REPO","path":"PATH","branch":"SHA","minify":"symbols"}'
npx octocode tools ghSearchHistory --queries '{"operation":"commits","owner":"OWNER","repo":"REPO","path":"PATH"}'
npx octocode tools ghGetHistoryItem --queries '{"operation":"pullRequest","owner":"OWNER","repo":"REPO","number":123,"content":{"body":true}}'
```

Errors are self-correcting — a missing/typo'd field returns a guiding message (for example, *"Repository
scope requires owner"*); fix and retry. For a field this primer doesn't cover, `npx octocode
tools <name> --scheme --brief` prints the compact schema (that call is measured). Freeze every
mutable ref (branch/PR-state/SHA + UTC) before answering; use the frozen ref.

# MCP Tools Audit Report

> Comprehensive schema-level testing of all 14 Octocode MCP tools.
> ~60 parameter combinations tested. Each tool rated on response quality, schema compliance, and reliability.
> **Last re-audit: Feb 17, 2026**

---

## Summary Scorecard

| # | Tool | Rating | Prev | Category | Critical Issues |
|---|------|--------|------|----------|----------------|
| 1 | `localSearchCode` | **9/10** | 9/10 | Local | `count`+`filesOnly` conflict silently drops count |
| 2 | `localViewStructure` | **9/10** | 8/10 | Local | ~~`details` param has no visible effect~~ **FIXED** |
| 3 | `localFindFiles` | **9/10** | 6/10 | Local | ~~**`regex` param broken**~~ **FIXED** — `-E` flag now whitelisted |
| 4 | `localGetFileContent` | **10/10** | 10/10 | Local | None — all params work flawlessly |
| 5 | `githubSearchRepositories` | **9/10** | 8/10 | GitHub | ~~`totalMatches` always 0~~ **FIXED** — now returns proper counts |
| 6 | `githubSearchCode` | **9/10** | 8/10 | GitHub | ~~`totalMatches` always 0~~ **FIXED** — now returns proper counts |
| 7 | `githubViewRepoStructure` | **9/10** | 9/10 | GitHub | None |
| 8 | `githubGetFileContent` | **9/10** | 9/10 | GitHub | None |
| 9 | `githubSearchPullRequests` | **8/10** | 8/10 | GitHub | Output can be extremely large (78KB+) |
| 10 | `packageSearch` | **4/10** | 3/10 | GitHub | **npm public search still broken** — empty for `express`, `zod`; `mcp` no longer times out |
| 11 | `githubCloneRepo` | **9/10** | 9/10 | GitHub | None |
| 12 | `lspGotoDefinition` | **8/10** | 8/10 | LSP | `orderHint` fails on re-exports |
| 13 | `lspFindReferences` | **9.5/10** | 9.5/10 | LSP | None — near-perfect |
| 14 | `lspCallHierarchy` | **8/10** | 8/10 | LSP | `depth:2` produces very large output (101KB) |

**Overall Average: 8.6/10** (up from 8.0/10)

---

## Changes Since Last Audit

| Change | Tool | Details |
|--------|------|---------|
| **FIXED** | `localViewStructure` | `details: true` now shows permissions (`-rw-r--r--@`), file sizes, and modification dates |
| **FIXED** | `localViewStructure` | `hidden: true` confirmed working — `.claude/`, `.context/` dotdirs visible |
| **FIXED** | `localFindFiles` | `regex` with `regexType: "posix-extended"` now works — `-E` flag whitelisted in security layer |
| **FIXED** | `githubSearchRepositories` | `pagination.totalMatches` returns proper counts (e.g. 157, 1000, 3) |
| **FIXED** | `githubSearchCode` | `pagination.totalMatches` returns proper counts (e.g. 13, 42, 15) |
| **IMPROVED** | `packageSearch` | npm `mcp` search no longer times out (was 30s timeout); returns @wix scoped packages |
| **UNCHANGED** | `packageSearch` | npm public search still broken for `express`, `zod` (empty results) |
| **UNCHANGED** | `lspGotoDefinition` | `orderHint` still fails on re-exports |
| **UNCHANGED** | `githubSearchPullRequests` | Large output concern still present (78KB+ for 3 PRs) |
| **UNCHANGED** | `lspCallHierarchy` | `depth: 2` still produces ~101KB output |

---

## Detailed Test Results

### 1. `localSearchCode` — 9/10

Tested parameters: `mode` (discovery/paginated/detailed), `filesOnly`, `include`, `exclude`, `count`, `matchContentLength`, `filesPerPage`, `matchesPerPage`, `caseInsensitive`, `maxMatchesPerFile`, `maxFiles`, `sort`, `lineNumbers`, `fixedString`, `multiline`, `wholeWord`.

| Param / Combo | Status | Details |
|---|---|---|
| `mode: "discovery"` | PASS | File-level summary with matchCount per file, no match content — correct |
| `mode: "paginated"` | PASS | Matches with byte/char offsets returned |
| `mode: "detailed"` | PASS | Matches with context lines included |
| `filesOnly: true` | PASS | Returns file paths only |
| `include: ["*.ts"]` | PASS | Glob filtering works; includes helpful tip ("use type= instead") |
| `exclude: ["*.test.ts"]` | PASS | Exclusion pattern correctly applied |
| `matchContentLength: 400` | PASS | Extended from default 200 to 400 chars — respected |
| `filesPerPage: 3` | PASS | Correct pagination |
| `matchesPerPage: 2` | PASS | Per-file match limiting |
| `caseInsensitive: true` | PASS | Works, includes priority warning |
| `maxMatchesPerFile: 2` | PASS | Capped per-file matches |
| `maxFiles: 5` | PASS | Limited files returned |
| `sort: "modified"` | PASS | Results sorted by modification time |
| `lineNumbers: true` | PASS | Line/column numbers in results |
| `count + filesOnly` | WARN | "Mutually exclusive" warning — count silently ignored |

**Strengths:**
- Three distinct modes (`discovery`, `paginated`, `detailed`) work correctly with different output shapes
- Rich pagination metadata with `totalMatches`, `totalFiles`, page info
- Good validation warnings and tips (e.g., "Use type= instead of include glob")
- Byte and character offsets provided for programmatic use

**Issue:**
- `count` + `filesOnly` are declared mutually exclusive — `count` is silently dropped with warning message. Should either return count data or produce an error.

---

### 2. `localViewStructure` — 9/10 (↑ from 8/10)

Tested parameters: `depth`, `filesOnly`, `directoriesOnly`, `extension`, `extensions`, `pattern`, `sortBy`, `reverse`, `limit`, `details`, `hidden`, `entriesPerPage`.

| Param / Combo | Status | Details |
|---|---|---|
| `depth: 2` | PASS | Nested directory contents with files shown |
| `filesOnly: true` | PASS | Only files returned, 0 directories |
| `directoriesOnly: true` | PASS | Only directories returned, 0 files |
| `extension: "ts"` | PASS | Filtered to .ts files |
| `extensions: ["ts","json"]` | PASS | Multi-extension filter works |
| `sortBy: "size"` | PASS | Largest files first |
| `sortBy: "name"` + `reverse: true` | PASS | Z-A ordering |
| `limit: 10` | PASS | Capped to 10 entries |
| `pattern: "error"` | PASS | Matched `errorCodes.ts` |
| `entriesPerPage: 5` | PASS | Pagination with 5 per page |
| `details: true` | **PASS** | ~~No visible change~~ **FIXED** — shows permissions (`-rw-r--r--@`), sizes, dates |
| `hidden: true` | **PASS** | ~~UNCLEAR~~ **CONFIRMED** — `.claude/` and `.context/` dotdirs visible |

**Strengths:**
- Flexible filtering (files/dirs only, extensions, patterns)
- Sorting and reverse work correctly
- Clean pagination with `totalFiles`/`totalDirectories`
- `details` now provides permissions, sizes, and modification dates

**Issues:** None remaining.

---

### 3. `localFindFiles` — 9/10 (↑ from 6/10)

Tested parameters: `name`, `iname`, `names`, `regex`, `regexType`, `type`, `maxDepth`, `sortBy`, `filesPerPage`, `sizeGreater`, `sizeLess`, `details`.

| Param / Combo | Status | Details |
|---|---|---|
| `name: "*.test.ts"` | PASS | Found 202 test files |
| `maxDepth: 3` | PASS | Depth limiting works |
| `sortBy: "modified"` | PASS | Most recent first |
| `filesPerPage: 5` | PASS | Pagination respected |
| `iname: "README*"` | PASS | Case-insensitive, found 2 README files |
| `type: "f"` | PASS | File type filter works |
| `regex` + `regexType: "posix-extended"` | **PASS** | ~~FAIL~~ **FIXED** — Found 221 `.test.ts`/`.spec.ts` files |
| `sizeGreater: "5k"` | PASS | Lower bound filter |
| `sizeLess: "15k"` | PASS | Upper bound filter (90 files in range) |
| `sortBy: "size"` | PASS | Largest first |
| `names: ["package.json","tsconfig.json"]` | PASS | Multi-name search |
| `sortBy: "name"` | PASS | Alphabetical |

**Strengths:**
- Name/iname (case-insensitive), multi-name, and size filters work well
- Sorting and pagination reliable
- `regex` with `posix-extended` now works correctly

**Issues:** None remaining. Previous P0 `regex` bug is fixed.

---

### 4. `localGetFileContent` — 10/10

Tested parameters: `startLine`, `endLine`, `fullContent`, `matchString`, `matchStringContextLines`, `charOffset`, `charLength`, `matchStringIsRegex`, `matchStringCaseSensitive`.

| Param / Combo | Status | Details |
|---|---|---|
| `startLine: 1` + `endLine: 20` | PASS | Exact line range with `totalLines` info |
| `matchString` + `matchStringContextLines: 10` | PASS | Found target, returned context window |
| `fullContent: true` | PASS | Complete file returned, `isPartial: false` |
| `charOffset: 0` + `charLength: 500` | PASS | Character-based extraction with page info |
| `matchStringIsRegex: true` | PASS | Regex `"isToolError\|toToolError"` matched both |
| `matchStringCaseSensitive: true` | PASS | Case-sensitive matching |

**Strengths:**
- Every extraction mode works perfectly
- `matchRanges` metadata shows where matches were found
- `charOffset/charLength` pagination info ("page 1 of 7, next: charOffset=500")
- `isPartial` / `totalLines` fields useful for understanding content completeness
- Multiple match ranges returned for regex patterns

**Issues:** None.

---

### 5. `githubSearchRepositories` — 9/10 (↑ from 8/10)

Tested parameters: `topicsToSearch`, `stars`, `sort`, `keywordsToSearch`, `match`, `created`, `owner`, `limit`.

| Param / Combo | Status | Details |
|---|---|---|
| `topicsToSearch: ["mcp","model-context-protocol"]` | PASS | Found fastmcp (22K stars), mcp-for-beginners, etc. |
| `stars: ">100"` | PASS | Filtered to 100+ star repos |
| `sort: "stars"` | PASS | Ordered by star count |
| `keywordsToSearch: ["mcp server"]` | PASS | Found relevant repos |
| `match: ["name","description"]` | PASS | Scoped matching fields |
| `created: ">2025-01-01"` | PASS | Date filter works |
| `owner: "bgauryy"` | PASS | Scoped to owner |
| `sort: "updated"` | PASS | Updated ordering |
| `limit: 3` / `5` | PASS | Limits respected |
| `pagination.totalMatches` | **PASS** | ~~Always 0~~ **FIXED** — returns 157, 1000, 3 |

**Strengths:**
- Rich metadata: stars, forks, topics, dates, visibility
- `pushedAt` vs `updatedAt` distinction (code change vs metadata change)
- Owner scoping and date filtering work
- Pagination `totalMatches` now returns correct counts

**Issues:** None remaining.

---

### 6. `githubSearchCode` — 9/10 (↑ from 8/10)

Tested parameters: `match` (file/path), `path`, `extension`, `filename`, `keywordsToSearch` (single/multi), `owner`, `repo`, `limit`.

| Param / Combo | Status | Details |
|---|---|---|
| `match: "path"` + `path` filter | PASS | Found files by path pattern; no `text_matches` (by design) |
| `match: "file"` | PASS | Full `text_matches` with code snippets |
| `extension: "ts"` | PASS | TypeScript filter |
| `filename: "execution"` | PASS | Filename filter |
| Multi-keyword `["registerTool","server"]` | PASS | Combined keyword search |
| `limit: 3` / `5` | PASS | Limits respected |
| `pagination.totalMatches` | **PASS** | ~~Always 0~~ **FIXED** — returns 13, 42, 15 |

**Strengths:**
- `repositoryContext` field provides owner/repo/branch for chaining to other tools
- `text_matches` provide code snippets for quick review
- `match=path` mode is useful for file discovery without content matching
- Pagination `totalMatches` now returns correct counts

**Issues:** None remaining.

---

### 7. `githubViewRepoStructure` — 9/10

Tested parameters: `path`, `depth` (1/2), `branch`, `entriesPerPage`, `entryPageNumber`.

| Param / Combo | Status | Details |
|---|---|---|
| `depth: 1` | PASS | Top-level structure |
| `depth: 2` | PASS | Nested contents with files per subfolder |
| `entriesPerPage: 30` | PASS | Larger page size |
| `entriesPerPage: 5` | PASS | Small page for pagination |
| `entryPageNumber: 2` | PASS | Page 2 shows different entries than page 1 |
| `branch: "main"` | PASS | Explicit branch |

**Strengths:**
- Clean pagination with `summary.truncated` indicator
- Total counts accurate (`totalFiles`, `totalFolders`)
- Structured output organized by directory

**Issues:** None significant.

---

### 8. `githubGetFileContent` — 9/10

Tested parameters: `matchString`, `matchStringContextLines`, `startLine`, `endLine`, `fullContent`.

| Param / Combo | Status | Details |
|---|---|---|
| `matchString` + `matchStringContextLines: 5` | PASS | Found target string with context |
| `startLine: 1` + `endLine: 15` | PASS | Line range extraction |
| `fullContent: true` | PASS | Complete small file returned |

**Strengths:**
- `lastModified` and `lastModifiedBy` metadata — excellent for code archaeology
- `isPartial` flag for content completeness
- Consistent with `localGetFileContent` API shape

**Not tested:** `charOffset`/`charLength` on GitHub (tested locally only).

---

### 9. `githubSearchPullRequests` — 8/10

Tested parameters: `type` (metadata/partialContent), `state`, `merged`, `withComments`, `withCommits`, `prNumber`, `partialContentMetadata`, `limit`.

| Param / Combo | Status | Details |
|---|---|---|
| `type: "metadata"` | PASS | Rich PR metadata with file changes |
| `state: "closed"` + `merged: true` | PASS | Filter combination |
| `withComments: true` | PASS | Comments included |
| `withCommits: true` | PASS | Commit history included |
| `prNumber` + `type: "partialContent"` | PASS | Specific PR with file diffs |
| `partialContentMetadata` | PASS | Targeted file extraction |
| `state: "open"` | PASS | Open PR listing |
| `limit: 3` / `5` | PASS | Limits respected |

**Strengths:**
- Very comprehensive PR data (file changes with additions/deletions, commits, comments)
- `partialContent` mode with `partialContentMetadata` for targeted file diffs

**Issue:**
- Can produce extremely large outputs. 3 PRs metadata generated **78.3KB of output**. PR #320 (45 files) with `fullContent`+`withComments`+`withCommits` produces **139.3 KB** of unbounded output. Neither tool has output size limits or auto-pagination.

---

### 10. `packageSearch` — 4/10 (↑ from 3/10)

Tested parameters: `name`, `ecosystem` (npm/python), `searchLimit`, `npmFetchMetadata`, `pythonFetchMetadata`.

| Param / Combo | Status | Details |
|---|---|---|
| npm: `"express"` | **FAIL** | Empty result for a top-5 npm package |
| npm: `"zod"` + `npmFetchMetadata: true` | **FAIL** | Empty result |
| npm: `"mcp"` + `searchLimit: 5` | **PASS** | ~~Timeout~~ **FIXED** — found 5 @wix scoped packages |
| python: `"requests"` | PASS | Found `psf/requests` with repo URL |
| python: `"flask"` + `pythonFetchMetadata: true` | PASS | Found with version, description, lastPublished |

**Strengths:**
- Python/PyPI search works perfectly with rich metadata (version, description, repo URL, lastPublished)
- npm no longer times out on `mcp` search — found 5 @wix scoped packages

**Critical Issue:**
- **npm public search still broken**. Well-known packages (`express`, `zod`) return empty results. The npm search appears to work for private/scoped registries (@wix) but not the public npm registry. Python search remains perfect.

---

### 11. `githubCloneRepo` — 9/10

Tested parameters: `owner`, `repo`, `branch`, `sparse_path`, full clone (no sparse_path).

| Param / Combo | Status | Details |
|---|---|---|
| `sparse_path` | PASS | Sparse checkout to cache dir with hash suffix |
| Full clone (no sparse) | PASS | Complete shallow clone |
| `branch: "main"` | PASS | Explicit branch selection |

**Strengths:**
- Fast shallow cloning (`--depth 1`)
- Clear cache path naming (`main/` vs `main__sp_f8155e`)
- `expiresAt` (24-hour TTL) and `cached` fields
- Helpful hints for using local tools on the cloned path

**Issues:** None significant.

---

### 12. `lspGotoDefinition` — 8/10

Tested parameters: `symbolName`, `uri`, `lineHint`, `contextLines` (0/5/10), `orderHint`.

| Param / Combo | Status | Details |
|---|---|---|
| `contextLines: 10` | PASS | Full class body with 10 lines before/after |
| `contextLines: 0` | PASS | Only the definition range (lines 20-92) — no context |
| `contextLines: 5` (default) | PASS | Standard context |
| `orderHint: 1` | **FAIL** | "Symbol not found" for re-exported symbol |

**Strengths:**
- Rich content with numbered lines and highlighted definition range
- `resolvedPosition` shows exact resolved character position
- `searchRadius` info useful for debugging misses
- `displayRange` clearly shows what lines are returned

**Issue:**
- `orderHint` fails to resolve alternate definitions for imports/re-exports. Symbol "ToolError" at an import line (line 22 in `errorCodes.ts`) returned "not found" instead of navigating to the source definition.

---

### 13. `lspFindReferences` — 9.5/10

Tested parameters: `symbolName`, `uri`, `lineHint`, `contextLines`, `includeDeclaration`, `includePattern`, `excludePattern`, `referencesPerPage`, `page`.

| Param / Combo | Status | Details |
|---|---|---|
| `includeDeclaration: true` | PASS | Definition flagged with `isDefinition: true` |
| `includeDeclaration: false` | PASS | Definition excluded from results (31 vs 32) |
| `includePattern: ["**/errors/**"]` | PASS | "Filtered: 29 of 32 total references match patterns" |
| `excludePattern: ["**/tests/**"]` | PASS | "Filtered: 20 of 32 total references match patterns" |
| `referencesPerPage: 5` | PASS | Pagination respected |
| `referencesPerPage: 10` | PASS | Larger page |
| `contextLines: 2` / `3` | PASS | Different context windows |

**Strengths:**
- Best filtering UX of all tools
- `includePattern` / `excludePattern` glob filters are very powerful
- Filter transparency: "Filtered: 29 of 32 total references match patterns"
- `isDefinition` flag per reference
- `symbolKind` metadata ("class", "function")
- `hasMultipleFiles` boolean indicator

**Issues:** None.

---

### 14. `lspCallHierarchy` — 8/10

Tested parameters: `symbolName`, `uri`, `lineHint`, `direction` (incoming/outgoing), `depth` (1/2), `contextLines`, `callsPerPage`.

| Param / Combo | Status | Details |
|---|---|---|
| `direction: "incoming"` | PASS | Found 3 callers correctly |
| `direction: "outgoing"` | PASS | No callees for leaf function (correct) |
| `depth: 1` | PASS | Single level tracing |
| `depth: 2` | PASS | Two-level chain — **101.2 KB output** |
| `callsPerPage: 10` | PASS | Pagination works |
| `contextLines: 2` / `3` | PASS | Context window respected |

**Strengths:**
- Deep call chain tracing with multi-level support
- `fromRanges` provides precise call-site locations within each caller
- Rich content showing both caller function body and call sites
- Pagination for large call trees

**Issue:**
- `depth: 2` produces extremely large output (**101.2 KB** for one query). Token-expensive. Recommendation from hints ("depth=1 + chain manually is faster than depth=3") is correct.

---

## Issues Summary

### Critical Bugs

| Priority | Tool | Issue | Impact | Status |
|----------|------|-------|--------|--------|
| ~~P0~~ | ~~`packageSearch`~~ | ~~npm search completely non-functional~~ | ~~50% of tool broken~~ | **Partially fixed** — no longer times out, @wix scoped works |
| P0 | `packageSearch` | **npm public search broken** — empty results for `express`, `zod` | Public npm lookup unusable | **OPEN** |
| ~~P0~~ | ~~`localFindFiles`~~ | ~~`regex` param broken — security blocks `-E` flag~~ | ~~Schema param unusable~~ | **FIXED** |
| ~~P1~~ | ~~`githubSearchRepositories`~~ | ~~`pagination.totalMatches` always returns `0`~~ | ~~Misleading pagination data~~ | **FIXED** |
| ~~P1~~ | ~~`githubSearchCode`~~ | ~~`pagination.totalMatches` always returns `0`~~ | ~~Misleading pagination data~~ | **FIXED** |

### Minor Issues

| Priority | Tool | Issue | Impact | Status |
|----------|------|-------|--------|--------|
| ~~P2~~ | ~~`localViewStructure`~~ | ~~`details` param has no visible effect~~ | ~~Schema param ineffective~~ | **FIXED** |
| P2 | `localSearchCode` | `count` + `filesOnly` conflict — count silently dropped | Unexpected param behavior | OPEN |
| P2 | `lspGotoDefinition` | `orderHint` fails for re-exports/imports | Edge case failure | OPEN |
| P3 | `githubSearchPullRequests` | `withComments` + `withCommits` produces 78KB+ output | Token cost | OPEN |
| P3 | `lspCallHierarchy` | `depth: 2` produces 101KB+ output | Token cost | OPEN |

### Recommendations

1. **`packageSearch` (npm public):** npm search works for private/scoped registries (@wix) but fails for public npm. Likely a registry URL configuration issue — the tool may be querying a private registry instead of `registry.npmjs.org`. Investigate the npm search mechanism.
2. **Large output protection:** Consider adding output size limits or auto-truncation for `githubSearchPullRequests` (with comments/commits) and `lspCallHierarchy` (depth > 1). **VERIFIED STILL OPEN:** PR #320 (45 files) metadata alone generated **78.3 KB**. `lspCallHierarchy` with `depth: 2` produces **101.2 KB**. Neither tool has output size limits, `charOffset`/`charLength`, or auto-pagination — unlike `localViewStructure` and `localFetchContent` which cap at 2000 chars with auto-pagination.

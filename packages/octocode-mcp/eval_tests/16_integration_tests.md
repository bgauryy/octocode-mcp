# Eval Test: Integration Tests (Cross-Tool)

> **Category: Integration** | Last tested: Feb 17, 2026

---

## Overview

Cross-tool integration tests validate end-to-end workflows that chain multiple Octocode tools together. These tests verify the **Funnel Method**: Structure → Search → Locate → Analyze → Read.

Each flow tests that output from one tool feeds correctly into the next.

---

## Test Cases

### Flow 1: Local Funnel — Structure → Search → Define → References

**Goal:** Verify the complete local research funnel on the current workspace.

**Tools:** `localViewStructure` → `localSearchCode` → `lspGotoDefinition` → `lspFindReferences`

**Steps:**
1. `localViewStructure(path="<WORKSPACE_ROOT>", depth=2)` → identify source directory
2. `localSearchCode(pattern="export function", path="<src>", mode="discovery")` → pick a function, get `lineHint`
3. `lspGotoDefinition(uri="<file>", symbolName="<fn>", lineHint=<N>)` → resolve definition
4. `lspFindReferences(uri="<def_file>", symbolName="<fn>", lineHint=<def_line>)` → find all usages

**Expected:**
- [ ] Structure shows source files
- [ ] Search returns files with matches + lineHint
- [ ] Definition resolves to correct file/line
- [ ] References found across multiple files (source + tests)
- [ ] `isDefinition: true` on exactly one reference

---

### Flow 2: Call Hierarchy Trace

**Goal:** Verify full call hierarchy tracing from search through incoming/outgoing.

**Tools:** `localSearchCode` → `lspGotoDefinition` → `lspCallHierarchy` (incoming) → `lspCallHierarchy` (outgoing)

**Steps:**
1. `localSearchCode(pattern="<utility function>", path="<src>")` → get `lineHint`
2. `lspGotoDefinition(uri="<file>", symbolName="<fn>", lineHint=<N>)` → confirm definition
3. `lspCallHierarchy(uri="<file>", symbolName="<fn>", lineHint=<N>, direction="incoming")` → who calls it?
4. `lspCallHierarchy(uri="<caller_file>", symbolName="<caller_fn>", lineHint=<caller_line>, direction="outgoing")` → what does the caller call?

**Expected:**
- [ ] Incoming calls show callers with `fromRanges` (line+character)
- [ ] Outgoing calls show callees from the caller
- [ ] Cross-file references resolved correctly
- [ ] Function context (`item.content`) shows `>` markers on key lines

---

### Flow 3: Package Discovery → Repo Exploration → Code Search → Read

**Goal:** Verify external package research workflow.

**Tools:** `packageSearch` → `githubViewRepoStructure` → `githubSearchCode` → `githubGetFileContent`

**Steps:**
1. `packageSearch(ecosystem="npm", name="express")` → get repo URL (owner/repo)
2. `githubViewRepoStructure(owner="expressjs", repo="express", branch="master", path="", depth=1)` → see structure
3. `githubSearchCode(owner="expressjs", repo="express", keywordsToSearch=["middleware"])` → find code
4. `githubGetFileContent(owner="expressjs", repo="express", path="lib/router/index.js", matchString="function")` → read implementation

**Expected:**
- [ ] Package search returns repo URL
- [ ] Repo structure shows `lib/`, `test/`, `package.json`
- [ ] Code search returns files with middleware references
- [ ] File content returns matched section with context

---

### Flow 4: Clone → Local Analysis → LSP

**Goal:** Verify full clone-to-LSP workflow on an external repo.

**Tools:** `githubCloneRepo` → `localViewStructure` → `localSearchCode` → `lspGotoDefinition` → `lspFindReferences` → `lspCallHierarchy`

**Steps:**
1. `githubCloneRepo(owner="bgauryy", repo="octocode-mcp")` → get `localPath`
2. `localViewStructure(path=<localPath>, depth=2)` → browse cloned structure
3. `localSearchCode(pattern="export function", path=<localPath>)` → get `lineHint`
4. `lspGotoDefinition(uri=<file>, symbolName=<fn>, lineHint=<N>)` → resolve definition
5. `lspFindReferences(uri=<file>, symbolName=<fn>, lineHint=<N>)` → find usages
6. `lspCallHierarchy(uri=<file>, symbolName=<fn>, lineHint=<N>, direction="incoming")` → trace calls

**Expected:**
- [ ] Clone returns valid `localPath`
- [ ] All local tools work on cloned path
- [ ] LSP resolves definitions from cloned TypeScript code
- [ ] References span multiple cloned files
- [ ] Call hierarchy traces function relationships

---

### Flow 5: Sparse Clone → Targeted Search

**Goal:** Verify sparse checkout enables focused local analysis.

**Tools:** `githubCloneRepo` (sparse) → `localSearchCode` → `localGetFileContent`

**Steps:**
1. `githubCloneRepo(owner="facebook", repo="react", sparse_path="packages/react")` → get sparse `localPath`
2. `localSearchCode(pattern="createElement", path=<localPath>)` → search within sparse subtree
3. `localGetFileContent(path=<file_from_step_2>, matchString="export", matchStringContextLines=10)` → read code

**Expected:**
- [ ] Sparse clone only contains `packages/react` files
- [ ] `localPath` includes `__sp_` hash suffix
- [ ] Search finds matches within the sparse subtree
- [ ] File content readable with proper indentation
- [ ] Files outside sparse path NOT present on disk

---

### Flow 6: Directory Fetch → Local Tools

**Goal:** Verify directory fetch enables local analysis without full clone.

**Tools:** `githubGetFileContent` (directory) → `localViewStructure` → `localSearchCode` → `localGetFileContent`

**Steps:**
1. `githubGetFileContent(owner="bgauryy", repo="octocode-mcp", path="docs", type="directory")` → get `localPath`
2. `localViewStructure(path=<localPath>)` → browse fetched files
3. `localSearchCode(pattern="export", path=<localPath>)` → search fetched content
4. `localGetFileContent(path=<localPath>/<file>, fullContent=true)` → read specific file

**Expected:**
- [ ] Directory fetch returns `localPath`, `fileCount > 0`, `files` list
- [ ] `localViewStructure` shows fetched files
- [ ] Search finds matches in fetched content
- [ ] File content matches GitHub version
- [ ] Files on disk match the `files` array in response

---

### Flow 7: PR Archaeology — Find Why Code Changed

**Goal:** Verify code archaeology workflow for understanding change history.

**Tools:** `localSearchCode` → `githubSearchPullRequests` → `githubGetFileContent`

**Steps:**
1. `localSearchCode(pattern="<specific pattern>", path="<src>")` → identify file and code of interest
2. `githubSearchPullRequests(owner="bgauryy", repo="octocode-mcp", state="closed", merged=true, query="<relevant term>")` → find introducing PR
3. `githubSearchPullRequests(prNumber=<N>, type="metadata", withComments=true)` → read PR context
4. `githubGetFileContent(owner="bgauryy", repo="octocode-mcp", path="<file>", matchString="<pattern>")` → read current state

**Expected:**
- [ ] Local search identifies the code location
- [ ] PR search returns merged PRs related to the code
- [ ] PR metadata includes title, description, comments explaining WHY
- [ ] File content shows current implementation
- [ ] Comments provide historical context

---

### Flow 8: Cross-Provider — Clone vs Directory Fetch

**Goal:** Verify clone and directory fetch have independent caches and both work.

**Tools:** `githubGetFileContent` (directory) → `githubCloneRepo` → `localViewStructure` (both)

**Steps:**
1. `githubGetFileContent(owner="bgauryy", repo="octocode-mcp", path="docs", type="directory")` → fetch directory, get `localPathA`
2. `githubCloneRepo(owner="bgauryy", repo="octocode-mcp")` → full clone, get `localPathB`
3. `localViewStructure(path=<localPathA>)` → browse fetched directory
4. `localViewStructure(path=<localPathB>)` → browse cloned repo

**Expected:**
- [ ] Different `localPath` values (separate cache directories)
- [ ] Clone ignores directory fetch cache (fresh clone)
- [ ] Both paths usable by local tools
- [ ] Directory fetch has only `docs/` files
- [ ] Clone has full repository content

---

### Flow 9: Multi-Tool Search Comparison

**Goal:** Verify local search and GitHub search return consistent results for the same query.

**Tools:** `localSearchCode` → `githubSearchCode`

**Steps:**
1. `localSearchCode(pattern="withSecurityValidation", path="<WORKSPACE_ROOT>", mode="discovery")` → get local results
2. `githubSearchCode(owner="bgauryy", repo="octocode-mcp", keywordsToSearch=["withSecurityValidation"])` → get GitHub results

**Expected:**
- [ ] Both tools find the same core files
- [ ] Local search returns more detailed results (line numbers, context)
- [ ] GitHub search returns repo-wide results (may include branches)
- [ ] Neither tool misses files the other finds

---

### Flow 10: Find Files → Read → Define

**Goal:** Verify file discovery feeds into content reading and semantic analysis.

**Tools:** `localFindFiles` → `localGetFileContent` → `lspGotoDefinition`

**Steps:**
1. `localFindFiles(path="<WORKSPACE_ROOT>", name="*.ts", sortBy="size", type="f")` → find largest TS files
2. `localGetFileContent(path=<largest_file>, matchString="export function", matchStringContextLines=5)` → read exports
3. `lspGotoDefinition(uri=<file>, symbolName=<exported_fn>, lineHint=<match_line>)` → resolve definition

**Expected:**
- [ ] `localFindFiles` returns `.ts` files sorted by size (largest first)
- [ ] No `dist/`, `node_modules/` in results (default excludes)
- [ ] `localGetFileContent` finds exports with context
- [ ] `lspGotoDefinition` resolves from match line to definition

---

### Flow 11: Bulk Operations — Parallel Multi-Tool

**Goal:** Verify bulk queries across different tools work independently.

**Tools:** `localSearchCode` (5 queries) + `githubSearchCode` (3 queries)

**Steps:**
1. `localSearchCode` with 5 parallel queries: `["export", "import", "const", "function", "class"]`
2. `githubSearchCode` with 3 parallel queries: `["react", "vue", "angular"]`

**Expected:**
- [ ] All 5 local queries return independent results (no cross-contamination)
- [ ] All 3 GitHub queries return independent results
- [ ] Errors in one query don't affect others
- [ ] Each result has its own pagination metadata

---

### Flow 12: Repository Discovery → Deep Dive

**Goal:** Verify full external repository research workflow from discovery to code reading.

**Tools:** `githubSearchRepositories` → `githubViewRepoStructure` → `githubSearchCode` → `githubGetFileContent`

**Steps:**
1. `githubSearchRepositories(keywordsToSearch=["express"], match=["name"], stars=">1000")` → find express repo
2. `githubViewRepoStructure(owner="expressjs", repo="express", branch="master", path="lib", depth=2)` → explore lib/
3. `githubSearchCode(owner="expressjs", repo="express", keywordsToSearch=["createApplication"], match="file")` → find entry point
4. `githubGetFileContent(owner="expressjs", repo="express", path="lib/express.js", matchString="createApplication", matchStringContextLines=10)` → read implementation

**Expected:**
- [ ] Repo search finds expressjs/express with high star count
- [ ] Structure shows `lib/` contents at depth 2
- [ ] Code search finds `createApplication` in source files
- [ ] File content returns implementation with context

---

### Flow 13: LSP Chain — Type → References → Callers

**Goal:** Verify LSP tools chain correctly for type analysis.

**Tools:** `localSearchCode` → `lspFindReferences` → `lspCallHierarchy`

**Steps:**
1. `localSearchCode(pattern="interface.*Options", path="<src>", type="ts")` → find an interface, get `lineHint`
2. `lspFindReferences(uri=<file>, symbolName="<Interface>", lineHint=<N>)` → find all usages of the type
3. Pick a function that uses the type → `lspCallHierarchy(uri=<fn_file>, symbolName=<fn>, lineHint=<fn_line>, direction="incoming")` → who calls the function?

**Expected:**
- [ ] Search finds TypeScript interfaces
- [ ] `lspFindReferences` returns type usages across files (imports, function params, variables)
- [ ] `lspCallHierarchy` traces callers of functions that use the type
- [ ] Type references include `isDefinition: true` for the declaration

---

### Flow 14: Clone Cache Independence

**Goal:** Verify full clone, sparse clone, and directory fetch maintain separate caches.

**Tools:** `githubCloneRepo` (full) → `githubCloneRepo` (sparse) → `githubGetFileContent` (directory)

**Steps:**
1. `githubCloneRepo(owner="expressjs", repo="express")` → full clone, get `localPathA`
2. `githubCloneRepo(owner="expressjs", repo="express", sparse_path="lib")` → sparse clone, get `localPathB`
3. `githubGetFileContent(owner="expressjs", repo="express", path="lib", type="directory")` → dir fetch, get `localPathC`

**Expected:**
- [ ] Three different `localPath` values
- [ ] Full clone: `~/.octocode/repos/expressjs/express/{branch}/`
- [ ] Sparse clone: path includes `__sp_` hash suffix
- [ ] Directory fetch: separate cache from both clones
- [ ] All three paths work with `localViewStructure`

---

### Flow 15: Error Isolation in Cross-Tool Chains

**Goal:** Verify that a failure in one step of the chain doesn't cascade.

**Steps:**
1. `localSearchCode(pattern="nonexistent_xyz_99999", path="<src>")` → empty results
2. Attempt `lspGotoDefinition` with invalid lineHint → `symbol_not_found` error
3. `localSearchCode(pattern="export", path="<src>")` → should succeed normally

**Expected:**
- [ ] Empty search returns helpful hints (not crash)
- [ ] LSP error returns `symbol_not_found` with search radius hint
- [ ] Subsequent tool calls work normally (no state corruption)
- [ ] Each tool operates independently

---

### Flow 16: Mixed Local + GitHub on Same Codebase

**Goal:** Verify local and GitHub tools return consistent data for the same repo.

**Tools:** `localViewStructure` + `githubViewRepoStructure` on same repo

**Steps:**
1. `localViewStructure(path="<WORKSPACE_ROOT>", depth=1, sortBy="name")` → local structure
2. `githubViewRepoStructure(owner="bgauryy", repo="octocode-mcp", branch="main", path="", depth=1)` → GitHub structure

**Expected:**
- [ ] Both show the same top-level files and directories
- [ ] Local may include uncommitted files not on GitHub
- [ ] GitHub shows committed state of `main` branch
- [ ] Both list `packages/`, `docs/`, `skills/`, etc.

---

### Flow 17: End-to-End Research Funnel (Full)

**Goal:** Verify the complete research funnel from start to finish.

**Tools:** ALL tool categories chained together.

**Steps:**
1. **Discover**: `localViewStructure(path="<root>", depth=1)` → identify source dirs
2. **Search**: `localSearchCode(pattern="<target>", path="<src>", mode="discovery")` → find files
3. **Locate**: `lspGotoDefinition(uri=<file>, symbolName=<sym>, lineHint=<N>)` → jump to definition
4. **Analyze**: `lspFindReferences` → all usages; `lspCallHierarchy(incoming)` → callers
5. **Read**: `localGetFileContent(path=<file>, matchString="<key section>")` → implementation details
6. **Archaeology**: `githubSearchPullRequests(query="<sym>", merged=true)` → find introducing PR

**Expected:**
- [ ] Each stage narrows scope (Funnel Method works)
- [ ] `lineHint` flows correctly from search → LSP tools
- [ ] Cross-file references resolved
- [ ] PR search provides historical context
- [ ] Complete picture: what, where, who uses it, who calls it, why it was written

---

### Flow 18: Bulk Clone → Parallel Local Analysis

**Goal:** Verify bulk clone followed by parallel local tool usage.

**Tools:** `githubCloneRepo` (3 bulk) → `localSearchCode` (3 bulk)

**Steps:**
1. `githubCloneRepo` with 3 queries: express, lodash, octocode-mcp → 3 `localPath` values
2. `localSearchCode` with 3 queries: search "export" in each cloned path

**Expected:**
- [ ] All 3 repos cloned with independent `localPath` values
- [ ] Search in each cloned repo returns independent results
- [ ] No cross-contamination between repos
- [ ] Bulk results properly isolated per query index

---

## Advanced Edge Cases (Node Modules + Cross-Tool)

> Edge case tests for local tools operating on vendor files and advanced parameter combinations.

| # | Tool | Test | Query | Expected |
|---|------|------|-------|----------|
| 19 | `localSearchCode` | Node modules direct path | `path: "<root>/node_modules/<pkg>"`, `pattern: "<known symbol>"` | Searches vendor files when path is explicit |
| 20 | `localSearchCode` | Empty + complex regex | `pattern: "xyzzy_nonexistent"` and `pattern: "export (class\\|interface) \\w+"` | Empty returns helpful hints; regex alternation works |
| 21 | `localViewStructure` | Node modules browse | `path: "<root>/node_modules/<pkg>"`, `depth: 1` | Directory tree renders with `[DIR]`/`[FILE]` and pagination metadata |
| 22 | `localFindFiles` | Exclude behavior verification | `path: "<root>"` then `excludeDir: []` | Default excludes active; disabling excludes changes scope |
| 23 | `localFindFiles` | Metadata stress | `sizeGreater: "10k"`, `modifiedWithin: "7d"`, `sortBy: "size"` | Filters combine correctly (AND logic), sorting valid |
| 24 | `localGetFileContent` | Node modules file read | `path: "<root>/node_modules/<pkg>/package.json"`, `fullContent: true` | Reads vendor file safely; pagination/partial flags coherent |
| 25 | `localGetFileContent` | Regex + case-insensitive | `matchStringIsRegex: true`, `matchStringCaseSensitive: false` | Match targeting works without collapsing indentation |
| 26 | `lspGotoDefinition` | Import chaining regression | Query imported symbol in same file | Second hop resolves to source definition when available |
| 27 | `lspFindReferences` | Include/exclude patterns | `includePattern` / `excludePattern` on same symbol | Pattern filters narrow result set as expected |
| 28 | `lspCallHierarchy` | Non-function + depth=2 | Run on type/variable then function with `depth: 2` | Non-function handled gracefully; deep call graph stable |

---

## Bulk Query Tests

All tools support bulk queries (1-5 queries per call for local/LSP tools, 1-3 for GitHub/package tools).

### Normal

| # | Tool | Description | Query | Expected Result |
|---|------|-------------|-------|-----------------|
| 29 | githubSearchCode | 3 parallel searches | `queries=[{keywords:["react"]}, {keywords:["vue"]}, {keywords:["angular"]}]` | Returns 3 result sets |
| 30 | localSearchCode | 5 parallel searches | `queries=[{pattern:"export"}, {pattern:"import"}, {pattern:"const"}, {pattern:"let"}, {pattern:"function"}]` | Returns 5 result sets |
| 31 | lspGotoDefinition | 5 definitions | `queries=[{symbol:"a"}, {symbol:"b"}, {symbol:"c"}, {symbol:"d"}, {symbol:"e"}]` | Returns 5 definitions |
| 32 | packageSearch | 3 packages | `queries=[{name:"express"}, {name:"koa"}, {name:"fastify"}]` | Returns 3 package infos |
| 33 | lspCallHierarchy | 3 call traces | `queries=[{symbol:"a"}, {symbol:"b"}, {symbol:"c"}]` | Returns 3 call graphs |

### Edge / Failure

| # | Tool | Description | Query | Expected Result |
|---|------|-------------|-------|-----------------|
| 34 | githubSearchCode | 4 queries (over limit) | 4 queries | Validation error: max 3 |
| 35 | localSearchCode | 6 queries (over limit) | 6 queries | Validation error: max 5 |
| 36 | lspCallHierarchy | 4 queries (over limit) | 4 queries | Validation error: max 3 |
| 37 | Mixed valid/invalid | 3 queries, 1 invalid | Some valid, some errors | Partial success with errors |
| 38 | Empty queries array | `queries=[]` | — | Validation error: min 1 |

---

## Rate Limiting Tests

| # | Description | Action | Expected Result |
|---|-------------|--------|-----------------|
| 39 | GitHub rate limit info | Normal request | Returns `rateLimitRemaining` and `rateLimitReset` in headers |
| 40 | Approach rate limit | Multiple rapid requests | Returns rate limit warning |
| 41 | Exceed rate limit | Exhaust rate limit | Returns 403 with reset time |
| 42 | Rate limit recovery | Wait for reset | Requests succeed after reset |

---

## Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All 42 tests pass. Full funnel, cross-category, edge cases, bulk, rate limiting, and error isolation work. |
| 9 | 38-41 pass; minor issues (e.g. LSP on cloned repo flaky, PR search no results) |
| 8 | 34-37 pass; core flows work but some cross-tool chains have issues |
| 7 | 28-33 pass; basic flows work but LSP or clone integration fails |
| ≤6 | Core flows fail, tools don't chain, bulk operations break |

---

## Validation Checklist

| # | Flow | Status |
|---|------|--------|
| 1 | Local Funnel — Structure → Search → Define → References | |
| 2 | Call Hierarchy Trace | |
| 3 | Package Discovery → Repo Exploration → Code Search → Read | |
| 4 | Clone → Local Analysis → LSP | |
| 5 | Sparse Clone → Targeted Search | |
| 6 | Directory Fetch → Local Tools | |
| 7 | PR Archaeology — Find Why Code Changed | |
| 8 | Cross-Provider — Clone vs Directory Fetch | |
| 9 | Multi-Tool Search Comparison | |
| 10 | Find Files → Read → Define | |
| 11 | Bulk Operations — Parallel Multi-Tool | |
| 12 | Repository Discovery → Deep Dive | |
| 13 | LSP Chain — Type → References → Callers | |
| 14 | Clone Cache Independence | |
| 15 | Error Isolation in Cross-Tool Chains | |
| 16 | Mixed Local + GitHub on Same Codebase | |
| 17 | End-to-End Research Funnel (Full) | |
| 18 | Bulk Clone → Parallel Local Analysis | |
| 19 | Edge: node_modules search | |
| 20 | Edge: empty + complex regex | |
| 21 | Edge: node_modules browse | |
| 22 | Edge: exclude behavior verification | |
| 23 | Edge: metadata stress | |
| 24 | Edge: node_modules file read | |
| 25 | Edge: regex + case-insensitive | |
| 26 | Edge: import chaining regression | |
| 27 | Edge: include/exclude patterns | |
| 28 | Edge: non-function + depth=2 | |
| 29 | Bulk: githubSearchCode 3 parallel | |
| 30 | Bulk: localSearchCode 5 parallel | |
| 31 | Bulk: lspGotoDefinition 5 definitions | |
| 32 | Bulk: packageSearch 3 packages | |
| 33 | Bulk: lspCallHierarchy 3 traces | |
| 34 | Bulk: githubSearchCode over limit | |
| 35 | Bulk: localSearchCode over limit | |
| 36 | Bulk: lspCallHierarchy over limit | |
| 37 | Bulk: mixed valid/invalid | |
| 38 | Bulk: empty queries array | |
| 39 | Rate limit info | |
| 40 | Rate limit approach | |
| 41 | Rate limit exceed | |
| 42 | Rate limit recovery | |

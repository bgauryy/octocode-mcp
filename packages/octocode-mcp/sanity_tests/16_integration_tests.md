# Sanity Test: Integration Tests (Cross-Tool)

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
1. `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path="<WORKSPACE_ROOT>"`, `depth=2` → identify source directory
2. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="registerTools"`, `path="<WORKSPACE_ROOT>/packages/octocode-mcp/src"`, `mode="discovery"` → find files containing `registerTools`, get `lineHint`
3. `lspGotoDefinition` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri="<file from step 2>"`, `symbolName="registerTools"`, `lineHint=<from step 2>` → resolve definition
4. `lspFindReferences` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri="<file from step 3>"`, `symbolName="registerTools"`, `lineHint=<from step 3>` → find all usages

**Expected:**
- [ ] Structure shows source files
- [ ] Search returns files with matches + lineHint
- [ ] Definition resolves to correct file/line
- [ ] References found across multiple files (source + tests)
- [ ] `isDefinition: true` on exactly one reference
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 2: Call Hierarchy Trace

**Goal:** Verify full call hierarchy tracing from search through incoming/outgoing.

**Tools:** `localSearchCode` → `lspGotoDefinition` → `lspCallHierarchy` (incoming) → `lspCallHierarchy` (outgoing)

**Steps:**
1. `localSearchCode(pattern="validateToolPath", path="<WORKSPACE_ROOT>/packages/octocode-mcp/src")` → get `lineHint`
2. `lspGotoDefinition(uri="<file>", symbolName="validateToolPath", lineHint=<N>)` → confirm definition
3. `lspCallHierarchy(uri="<file>", symbolName="validateToolPath", lineHint=<N>, direction="incoming")` → who calls it?
4. `lspCallHierarchy(uri="<caller_file>", symbolName="<caller_fn>", lineHint=<caller_line>, direction="outgoing")` → what does the caller call?

**Expected:**
- [ ] Incoming calls show callers with `fromRanges` (line+character)
- [ ] Outgoing calls show callees from the caller
- [ ] Cross-file references resolved correctly
- [ ] Function context (`item.content`) shows `>` markers on key lines
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 3: Package Discovery → Repo Exploration → Code Search → Read

**Goal:** Verify external package research workflow.

**Tools:** `packageSearch` → `githubViewRepoStructure` → `githubSearchCode` → `githubGetFileContent`

**Steps:**
1. `packageSearch` with `mainResearchGoal`, `researchGoal`, `reasoning`; `ecosystem="npm"`, `name="express"` → get repo URL (owner/repo)
2. `githubViewRepoStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="expressjs"`, `repo="express"`, `branch="master"`, `path=""`, `depth=1` → see structure
3. `githubSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="expressjs"`, `repo="express"`, `keywordsToSearch=["middleware"]` → find code
4. `githubGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="expressjs"`, `repo="express"`, `path="lib/router/index.js"`, `matchString="function"` → read implementation

**Expected:**
- [ ] Package search returns repo URL
- [ ] Repo structure shows `lib/`, `test/`, `package.json`
- [ ] Code search returns files with middleware references
- [ ] File content returns matched section with context
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 4: Clone → Local Analysis → LSP

**Goal:** Verify full clone-to-LSP workflow on an external repo.

**Tools:** `githubCloneRepo` → `localViewStructure` → `localSearchCode` → `lspGotoDefinition` → `lspFindReferences` → `lspCallHierarchy`

**Steps:**
1. `githubCloneRepo` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"` → get `localPath`
2. `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<localPath>`, `depth=2` → browse cloned structure
3. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="export function"`, `path=<localPath>` → get `lineHint`
4. `lspGotoDefinition` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<file>`, `symbolName=<fn>`, `lineHint=<N>` → resolve definition
5. `lspFindReferences` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<file>`, `symbolName=<fn>`, `lineHint=<N>` → find usages
6. `lspCallHierarchy` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<file>`, `symbolName=<fn>`, `lineHint=<N>`, `direction="incoming"` → trace calls

**Expected:**
- [ ] Clone returns valid `localPath`
- [ ] All local tools work on cloned path
- [ ] LSP resolves definitions from cloned TypeScript code
- [ ] References span multiple cloned files
- [ ] Call hierarchy traces function relationships
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 5: Sparse Clone → Targeted Search

**Goal:** Verify sparse checkout enables focused local analysis.

**Tools:** `githubCloneRepo` (sparse) → `localSearchCode` → `localGetFileContent`

**Steps:**
1. `githubCloneRepo` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="facebook"`, `repo="react"`, `sparse_path="packages/react"` → get sparse `localPath`
2. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="createElement"`, `path=<localPath>` → search within sparse subtree
3. `localGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<file_from_step_2>`, `matchString="export"`, `matchStringContextLines=10` → read code

**Expected:**
- [ ] Sparse clone only contains `packages/react` files
- [ ] `localPath` includes `__sp_` hash suffix
- [ ] Search finds matches within the sparse subtree
- [ ] File content readable with proper indentation
- [ ] Files outside sparse path NOT present on disk
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 6: Directory Fetch → Local Tools

**Goal:** Verify directory fetch enables local analysis without full clone.

**Tools:** `githubGetFileContent` (directory) → `localViewStructure` → `localSearchCode` → `localGetFileContent`

**Steps:**
1. `githubGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"`, `path="docs"`, `type="directory"` → get `localPath`
2. `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<localPath>` → browse fetched files
3. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="export"`, `path=<localPath>` → search fetched content
4. `localGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<localPath>/<file>`, `fullContent=true` → read specific file

**Expected:**
- [ ] Directory fetch returns `localPath`, `fileCount > 0`, `files` list
- [ ] `localViewStructure` shows fetched files
- [ ] Search finds matches in fetched content
- [ ] File content matches GitHub version
- [ ] Files on disk match the `files` array in response
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 7: PR Archaeology — Find Why Code Changed

**Goal:** Verify code archaeology workflow for understanding change history.

**Tools:** `localSearchCode` → `githubSearchPullRequests` → `githubGetFileContent`

**Steps:**
1. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="withSecurityValidation"`, `path="<WORKSPACE_ROOT>/packages/octocode-mcp/src"` → identify file and code
2. `githubSearchPullRequests` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"`, `state="closed"`, `merged=true`, `query="security validation"` → find introducing PR
3. `githubSearchPullRequests` with `mainResearchGoal`, `researchGoal`, `reasoning`; `prNumber=<from step 2>`, `type="metadata"`, `withComments=true` → read PR context
4. `githubGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"`, `path="<file from step 1>"`, `matchString="withSecurityValidation"` → read current state

**Expected:**
- [ ] Local search identifies the code location
- [ ] PR search returns merged PRs related to the code
- [ ] PR metadata includes title, description, comments explaining WHY
- [ ] File content shows current implementation
- [ ] Comments provide historical context
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 8: Cross-Provider — Clone vs Directory Fetch

**Goal:** Verify clone and directory fetch have independent caches and both work.

**Tools:** `githubGetFileContent` (directory) → `githubCloneRepo` → `localViewStructure` (both)

**Steps:**
1. `githubGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"`, `path="docs"`, `type="directory"` → fetch directory, get `localPathA`
2. `githubCloneRepo` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"` → full clone, get `localPathB`
3. `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<localPathA>` → browse fetched directory
4. `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<localPathB>` → browse cloned repo

**Expected:**
- [ ] Different `localPath` values (separate cache directories)
- [ ] Clone ignores directory fetch cache (fresh clone)
- [ ] Both paths usable by local tools
- [ ] Directory fetch has only `docs/` files
- [ ] Clone has full repository content
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 9: Multi-Tool Search Comparison

**Goal:** Verify local search and GitHub search return consistent results for the same query.

**Tools:** `localSearchCode` → `githubSearchCode`

**Steps:**
1. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="withSecurityValidation"`, `path="<WORKSPACE_ROOT>"`, `mode="discovery"` → get local results
2. `githubSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"`, `keywordsToSearch=["withSecurityValidation"]` → get GitHub results

**Expected:**
- [ ] Both tools find the same core files
- [ ] Local search returns more detailed results (line numbers, context)
- [ ] GitHub search returns repo-wide results (may include branches)
- [ ] Neither tool misses files the other finds
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 10: Find Files → Read → Define

**Goal:** Verify file discovery feeds into content reading and semantic analysis.

**Tools:** `localFindFiles` → `localGetFileContent` → `lspGotoDefinition`

**Steps:**
1. `localFindFiles` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path="<WORKSPACE_ROOT>"`, `name="*.ts"`, `sortBy="size"`, `type="f"` → find largest TS files
2. `localGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<largest_file>`, `matchString="export function"`, `matchStringContextLines=5` → read exports
3. `lspGotoDefinition` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<file>`, `symbolName=<exported_fn>`, `lineHint=<match_line>` → resolve definition

**Expected:**
- [ ] `localFindFiles` returns `.ts` files sorted by size (largest first)
- [ ] No `dist/`, `node_modules/` in results (default excludes)
- [ ] `localGetFileContent` finds exports with context
- [ ] `lspGotoDefinition` resolves from match line to definition
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 11: Bulk Operations — Parallel Multi-Tool

**Goal:** Verify bulk queries across different tools work independently.

**Tools:** `localSearchCode` (5 queries) + `githubSearchCode` (3 queries)

**Steps:**
1. `localSearchCode` with 5 parallel queries, each including `mainResearchGoal`, `researchGoal`, `reasoning`; patterns: `["export", "import", "const", "function", "class"]`
2. `githubSearchCode` with 3 parallel queries, each including `mainResearchGoal`, `researchGoal`, `reasoning`; keywords: `["react", "vue", "angular"]`

**Expected:**
- [ ] All 5 local queries return independent results (no cross-contamination)
- [ ] All 3 GitHub queries return independent results
- [ ] Errors in one query don't affect others
- [ ] Each result has its own pagination metadata
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 12: Repository Discovery → Deep Dive

**Goal:** Verify full external repository research workflow from discovery to code reading.

**Tools:** `githubSearchRepositories` → `githubViewRepoStructure` → `githubSearchCode` → `githubGetFileContent`

**Steps:**
1. `githubSearchRepositories` with `mainResearchGoal`, `researchGoal`, `reasoning`; `keywordsToSearch=["express"]`, `match=["name"]`, `stars=">1000"` → find express repo
2. `githubViewRepoStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="expressjs"`, `repo="express"`, `branch="master"`, `path="lib"`, `depth=2` → explore lib/
3. `githubSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="expressjs"`, `repo="express"`, `keywordsToSearch=["createApplication"]`, `match="file"` → find entry point
4. `githubGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="expressjs"`, `repo="express"`, `path="lib/express.js"`, `matchString="createApplication"`, `matchStringContextLines=10` → read implementation

**Expected:**
- [ ] Repo search finds expressjs/express with high star count
- [ ] Structure shows `lib/` contents at depth 2
- [ ] Code search finds `createApplication` in source files
- [ ] File content returns implementation with context
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 13: LSP Chain — Type → References → Callers

**Goal:** Verify LSP tools chain correctly for type analysis.

**Tools:** `localSearchCode` → `lspFindReferences` → `lspCallHierarchy`

**Steps:**
1. `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="interface SanitizationResult"`, `path="<WORKSPACE_ROOT>/packages/octocode-mcp/src"`, `type="ts"` → find the interface, get `lineHint`
2. `lspFindReferences` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<file>`, `symbolName="SanitizationResult"`, `lineHint=<N>` → find all usages of the type
3. Pick a function from the references → `lspCallHierarchy` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<fn_file>`, `symbolName=<fn using SanitizationResult>`, `lineHint=<fn_line>`, `direction="incoming"` → who calls it?

**Expected:**
- [ ] Search finds TypeScript interfaces
- [ ] `lspFindReferences` returns type usages across files (imports, function params, variables)
- [ ] `lspCallHierarchy` traces callers of functions that use the type
- [ ] Type references include `isDefinition: true` for the declaration
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

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
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1

---

### Flow 15: Error Isolation in Cross-Tool Chains

**Goal:** Verify that a failure in one step of the chain doesn't cascade.

**Steps:**
1. `localSearchCode(pattern="nonexistent_xyz_99999", path="<WORKSPACE_ROOT>/packages/octocode-mcp/src")` → empty results
2. Attempt `lspGotoDefinition` with invalid lineHint (e.g., `lineHint=99999`) → `symbol_not_found` error
3. `localSearchCode(pattern="export", path="<WORKSPACE_ROOT>/packages/octocode-mcp/src")` → should succeed normally

**Expected:**
- [ ] Empty search returns helpful hints (not crash)
- [ ] LSP error returns `symbol_not_found` with search radius hint
- [ ] Subsequent tool calls work normally (no state corruption)
- [ ] Each tool operates independently
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Error step returns `errorStatusHints` with recovery suggestions

---

### Flow 16: Mixed Local + GitHub on Same Codebase

**Goal:** Verify local and GitHub tools return consistent data for the same repo.

**Tools:** `localViewStructure` + `githubViewRepoStructure` on same repo

**Steps:**
1. `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path="<WORKSPACE_ROOT>"`, `depth=1`, `sortBy="name"` → local structure
2. `githubViewRepoStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `owner="bgauryy"`, `repo="octocode-mcp"`, `branch="main"`, `path=""`, `depth=1` → GitHub structure

**Expected:**
- [ ] Both show the same top-level files and directories
- [ ] Local may include uncommitted files not on GitHub
- [ ] GitHub shows committed state of `main` branch
- [ ] Both list `packages/`, `docs/`, `skills/`, etc.
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 17: End-to-End Research Funnel (Full)

**Goal:** Verify the complete research funnel from start to finish.

**Tools:** ALL tool categories chained together.

**Steps:**
1. **Discover**: `localViewStructure` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path="<root>"`, `depth=1` → identify source dirs
2. **Search**: `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="ContentSanitizer"`, `path="<WORKSPACE_ROOT>/packages/octocode-mcp/src"`, `mode="discovery"` → find files
3. **Locate**: `lspGotoDefinition` with `mainResearchGoal`, `researchGoal`, `reasoning`; `uri=<file>`, `symbolName="ContentSanitizer"`, `lineHint=<N>` → jump to definition
4. **Analyze**: `lspFindReferences` and `lspCallHierarchy(incoming)` with `mainResearchGoal`, `researchGoal`, `reasoning` → all usages and callers
5. **Read**: `localGetFileContent` with `mainResearchGoal`, `researchGoal`, `reasoning`; `path=<file>`, `matchString="sanitizeContent"` → implementation details
6. **Archaeology**: `githubSearchPullRequests` with `mainResearchGoal`, `researchGoal`, `reasoning`; `query="ContentSanitizer"`, `merged=true` → find introducing PR

**Expected:**
- [ ] Each stage narrows scope (Funnel Method works)
- [ ] `lineHint` flows correctly from search → LSP tools
- [ ] Cross-file references resolved
- [ ] PR search provides historical context
- [ ] Complete picture: what, where, who uses it, who calls it, why it was written
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 18: Bulk Clone → Parallel Local Analysis

**Goal:** Verify bulk clone followed by parallel local tool usage.

**Tools:** `githubCloneRepo` (3 bulk) → `localSearchCode` (3 bulk)

**Steps:**
1. `githubCloneRepo` with 3 queries, each including `mainResearchGoal`, `researchGoal`, `reasoning`; repos: express, lodash, octocode-mcp → 3 `localPath` values
2. `localSearchCode` with 3 queries, each including `mainResearchGoal`, `researchGoal`, `reasoning`; search "export" in each cloned path

**Expected:**
- [ ] All 3 repos cloned with independent `localPath` values
- [ ] Search in each cloned repo returns independent results
- [ ] No cross-contamination between repos
- [ ] Bulk results properly isolated per query index
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

### Flow 19: Response Hints Chain Validation

**Goal:** Verify hints from each tool in a chain correctly guide the next tool call.

**Tools:** `localSearchCode` → `lspGotoDefinition` → `lspFindReferences`

**Steps:**
1. Run `localSearchCode` with `mainResearchGoal`, `researchGoal`, `reasoning`; `pattern="export function"`, `path="<WORKSPACE_ROOT>/packages/octocode-mcp/src"` → get matches with `lineHint`
2. Run `lspGotoDefinition` with `mainResearchGoal`, `researchGoal`, `reasoning`; use `uri`, `symbolName`, `lineHint` from step 1
3. Run `lspFindReferences` with `mainResearchGoal`, `researchGoal`, `reasoning`; use `uri`, `symbolName`, `lineHint` from step 2 definition

**Expected:**
- [ ] Hints from search suggest LSP tools (e.g., `lspGotoDefinition` for symbol resolution)
- [ ] Hints from definition suggest references (e.g., `lspFindReferences` for usage analysis)
- [ ] Hints from references suggest file reading or further analysis (e.g., `localGetFileContent` for implementation details)
- [ ] Each step's hints are actionable and inform the next logical tool call
- [ ] **Response Validation (per step):**
  - [ ] Each tool response includes `instructions` and `results` array
  - [ ] Each response includes status-specific hints
  - [ ] Hints from step N inform parameters for step N+1
  - [ ] Final step hints provide analysis/summary guidance

---

## Advanced Edge Cases (Node Modules + Cross-Tool)

> Edge case tests for local tools operating on vendor files and advanced parameter combinations.

| # | Tool | Test | Query | Expected | Response Validation |
|---|------|------|-------|----------|---------------------|
| 20 | `localSearchCode` | Node modules direct path | `path: "<root>/node_modules/<pkg>"`, `pattern: "<known symbol>"` | Searches vendor files when path is explicit | Verify status, hints, pagination metadata |
| 21 | `localSearchCode` | Empty + complex regex | `pattern: "xyzzy_nonexistent"` and `pattern: "export (class\\|interface) \\w+"` | Empty returns helpful hints; regex alternation works | Verify status, hints, pagination metadata |
| 22 | `localViewStructure` | Node modules browse | `path: "<root>/node_modules/<pkg>"`, `depth: 1` | Directory tree renders with `[DIR]`/`[FILE]` and pagination metadata | Verify status, hints, pagination metadata |
| 23 | `localFindFiles` | Exclude behavior verification | `path: "<root>"` then `excludeDir: []` | Default excludes active; disabling excludes changes scope | Verify status, hints, pagination metadata |
| 24 | `localFindFiles` | Metadata stress | `sizeGreater: "10k"`, `modifiedWithin: "7d"`, `sortBy: "size"` | Filters combine correctly (AND logic), sorting valid | Verify status, hints, pagination metadata |
| 25 | `localGetFileContent` | Node modules file read | `path: "<root>/node_modules/<pkg>/package.json"`, `fullContent: true` | Reads vendor file safely; pagination/partial flags coherent | Verify status, hints, pagination metadata |
| 26 | `localGetFileContent` | Regex + case-insensitive | `matchStringIsRegex: true`, `matchStringCaseSensitive: false` | Match targeting works without collapsing indentation | Verify status, hints, pagination metadata |
| 27 | `lspGotoDefinition` | Import chaining regression | Query imported symbol in same file | Second hop resolves to source definition when available | Verify status, hints, pagination metadata |
| 28 | `lspFindReferences` | Include/exclude patterns | `includePattern` / `excludePattern` on same symbol | Pattern filters narrow result set as expected | Verify status, hints, pagination metadata |
| 29 | `lspCallHierarchy` | Non-function + depth=2 | Run on type/variable then function with `depth: 2` | Non-function handled gracefully; deep call graph stable | Verify status, hints, pagination metadata |

---

## Bulk Query Tests

All tools support bulk queries (1-5 queries per call for local/LSP tools, 1-3 for GitHub/package tools).

### Normal

| # | Tool | Description | Query | Expected Result |
|---|------|-------------|-------|-----------------|
| 30 | githubSearchCode | 3 parallel searches | `queries=[{keywords:["react"]}, {keywords:["vue"]}, {keywords:["angular"]}]` | Returns 3 result sets |
| 31 | localSearchCode | 5 parallel searches | `queries=[{pattern:"export"}, {pattern:"import"}, {pattern:"const"}, {pattern:"let"}, {pattern:"function"}]` | Returns 5 result sets |
| 32 | lspGotoDefinition | 5 definitions | `queries=[{symbolName:"registerTools"}, {symbolName:"validateToolPath"}, {symbolName:"ContentSanitizer"}, {symbolName:"sanitizeContent"}, {symbolName:"executeBulkOperation"}]` (each with valid `uri` + `lineHint` from prior search) | Returns 5 definitions |
| 33 | packageSearch | 3 packages | `queries=[{name:"express"}, {name:"koa"}, {name:"fastify"}]` | Returns 3 package infos |
| 34 | lspCallHierarchy | 3 call traces | `queries=[{symbolName:"registerTools"}, {symbolName:"validateToolPath"}, {symbolName:"sanitizeContent"}]` (each with valid `uri` + `lineHint`) | Returns 3 call graphs |

### Edge / Failure

| # | Tool | Description | Query | Expected Result |
|---|------|-------------|-------|-----------------|
| 35 | githubSearchCode | 4 queries (over limit) | 4 queries | Validation error: max 3 |
| 36 | localSearchCode | 6 queries (over limit) | 6 queries | Validation error: max 5 |
| 37 | lspCallHierarchy | 4 queries (over limit) | 4 queries | Validation error: max 3 |
| 38 | Mixed valid/invalid | 3 queries, 1 invalid | Some valid, some errors | Partial success with errors |
| 39 | Empty queries array | `queries=[]` | — | Validation error: min 1 |

---

## Rate Limiting Tests

> **Note:** Rate limit tests require deliberate API exhaustion and are **manual observation only** — they cannot be automated safely in a sanity test run.

| # | Description | Action | Expected Result |
|---|-------------|--------|-----------------|
| 40 | GitHub rate limit info | Normal request | Returns `rateLimitRemaining` and `rateLimitReset` in headers |
| 41 | Approach rate limit | Multiple rapid requests | Returns rate limit warning |
| 42 | Exceed rate limit | Exhaust rate limit | Returns 403 with reset time |
| 43 | Rate limit recovery | Wait for reset | Requests succeed after reset |

---

## Scoring

| Score | Criteria |
|:-----:|:---------|
| 10 | All 43 tests pass (19 flows + 10 edge cases + 10 bulk + 4 rate limit). Full funnel, cross-category, edge cases, bulk, error isolation, and hints chain validation work. |
| 9 | 39-42 pass; minor issues (e.g. LSP on cloned repo flaky, PR search no results) |
| 8 | 35-38 pass; core flows work but some cross-tool chains have issues |
| 7 | 30-34 pass; basic flows work but LSP or clone integration fails |
| ≤6 | Core flows fail, tools don't chain, bulk operations break |

---

## Validation Checklist

| # | Flow | Queries | Hints Chain | Status |
|---|------|---------|-------------|--------|
| 1 | Local Funnel — Structure → Search → Define → References | ✓ | ✓ | |
| 2 | Call Hierarchy Trace | ✓ | ✓ | |
| 3 | Package Discovery → Repo Exploration → Code Search → Read | ✓ | ✓ | |
| 4 | Clone → Local Analysis → LSP | ✓ | ✓ | |
| 5 | Sparse Clone → Targeted Search | ✓ | ✓ | |
| 6 | Directory Fetch → Local Tools | ✓ | ✓ | |
| 7 | PR Archaeology — Find Why Code Changed | ✓ | ✓ | |
| 8 | Cross-Provider — Clone vs Directory Fetch | ✓ | ✓ | |
| 9 | Multi-Tool Search Comparison | ✓ | ✓ | |
| 10 | Find Files → Read → Define | ✓ | ✓ | |
| 11 | Bulk Operations — Parallel Multi-Tool | ✓ | ✓ | |
| 12 | Repository Discovery → Deep Dive | ✓ | ✓ | |
| 13 | LSP Chain — Type → References → Callers | ✓ | ✓ | |
| 14 | Clone Cache Independence | ✓ | ✓ | |
| 15 | Error Isolation in Cross-Tool Chains | ✓ | ✓ | |
| 16 | Mixed Local + GitHub on Same Codebase | ✓ | ✓ | |
| 17 | End-to-End Research Funnel (Full) | ✓ | ✓ | |
| 18 | Bulk Clone → Parallel Local Analysis | ✓ | ✓ | |
| 19 | Response Hints Chain Validation | ✓ | ✓ | |
| 20 | Edge: node_modules search | | | |
| 21 | Edge: empty + complex regex | | | |
| 22 | Edge: node_modules browse | | | |
| 23 | Edge: exclude behavior verification | | | |
| 24 | Edge: metadata stress | | | |
| 25 | Edge: node_modules file read | | | |
| 26 | Edge: regex + case-insensitive | | | |
| 27 | Edge: import chaining regression | | | |
| 28 | Edge: include/exclude patterns | | | |
| 29 | Edge: non-function + depth=2 | | | |
| 30 | Bulk: githubSearchCode 3 parallel | | | |
| 31 | Bulk: localSearchCode 5 parallel | | | |
| 32 | Bulk: lspGotoDefinition 5 definitions | | | |
| 33 | Bulk: packageSearch 3 packages | | | |
| 34 | Bulk: lspCallHierarchy 3 traces | | | |
| 35 | Bulk: githubSearchCode over limit | | | |
| 36 | Bulk: localSearchCode over limit | | | |
| 37 | Bulk: lspCallHierarchy over limit | | | |
| 38 | Bulk: mixed valid/invalid | | | |
| 39 | Bulk: empty queries array | | | |
| 40 | Rate limit info (manual) | | | |
| 41 | Rate limit approach (manual) | | | |
| 42 | Rate limit exceed (manual) | | | |
| 43 | Rate limit recovery (manual) | | | |

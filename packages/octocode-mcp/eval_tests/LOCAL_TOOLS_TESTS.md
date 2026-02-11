# Octocode Local Tools — Test & Measurement Plan

> Universal test plan for evaluating all 7 local Octocode tools against **any repository**.
> Run these tests after deployment, upgrades, or configuration changes.

---

## Prerequisites

1. Open a workspace with a real codebase (any language)
2. Ensure the MCP server is running with `ENABLE_LOCAL=true`
3. Pick a **target directory** in the repo for all tests (e.g. `src/`)

---

## 1. `localSearchCode` (ripgrep)

**What it does**: Text/regex search across files with pagination and workflow modes.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **Discovery mode** | `pattern: "function"`, `mode: "discovery"` | Every file has `matchCount >= 1`, `matches: []` (no content bloat) |
| 2 | **Detailed mode + context** | `pattern: "import"`, `mode: "detailed"`, `contextLines: 3`, `matchesPerPage: 3` | Match values include surrounding lines; truncated at `matchContentLength` |
| 3 | **Regex** | `pattern: "export (class\|interface) \\w+"` | Regex alternation works; results are valid |
| 4 | **Case insensitive** | `pattern: "error"`, `caseInsensitive: true` | Matches `Error`, `ERROR`, `error` |
| 5 | **File filtering** | `include: ["*.ts"]` or `type: "ts"` | Only `.ts` files returned |
| 6 | **Pagination** | `filesPerPage: 5`, then `filePageNumber: 2` | `hasMore: true` on page 1; page 2 returns different files |
| 7 | **Bulk queries** | Send 3+ queries in one call | Each returns independent results; no cross-contamination |
| 8 | **Empty result** | `pattern: "xyzzy_nonexistent_string_12345"` | `status: "empty"` with helpful hints |

### Pass Criteria

All 8 return structured results. Discovery `matchCount` never 0. Pagination math correct.

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 8 pass, hints are actionable, bulk queries fully isolated |
| 9 | 7-8 pass; discovery `matchCount` always 1 (ripgrep `-l` limitation) — acceptable |
| 8 | 6-7 pass; minor issues (e.g. missing tip hints, pagination off-by-one) |
| 7 | Modes work but `matchCount: 0` in discovery, or regex fails |
| ≤6 | Core search fails, empty results not handled, crashes on regex |

---

## 2. `localViewStructure` (ls/tree)

**What it does**: Browse directory structure with sorting, filtering, and pagination.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **Basic depth=1** | `path: "<target>"`, `depth: 1` | Lists files and dirs at root level; `[DIR]`/`[FILE]` markers correct |
| 2 | **Deep scan** | `depth: 2`, `entriesPerPage: 50` | Subdirectory files appear indented; page size accepted (not capped at 20) |
| 3 | **Dates** | `showFileLastModified: true` | Every entry shows `YYYY-MM-DD` date in output string |
| 4 | **Sort by size** | `sortBy: "size"`, `filesOnly: true` | Files ordered smallest → largest (verify 3+ consecutive) |
| 5 | **Sort by name** | `sortBy: "name"` | Alphabetical order |
| 6 | **Pattern filter** | `pattern: "*.test.*"` or `pattern: "index*"` | Only matching files returned |
| 7 | **Extension filter** | `extensions: ["ts", "js"]` | Only those extensions appear |
| 8 | **Directories only** | `directoriesOnly: true` | Zero files in output |
| 9 | **Pagination** | `entriesPerPage: 5`, then `entryPageNumber: 2` | Correct page navigation; different entries per page |

### Pass Criteria

All 9 return formatted output. Dates visible when requested. Sorting verified on 3+ consecutive entries.

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 9 pass, dates render, entriesPerPage=50 accepted, all sort modes work |
| 9 | 8-9 pass; minor formatting edge case (e.g. no date on symlinks) |
| 8 | Dates missing from output despite `showFileLastModified: true` |
| 7 | `entriesPerPage` capped at 20; or sort modes don't work |
| ≤6 | Basic listing fails, filters ignored, pagination broken |

---

## 3. `localFindFiles` (find)

**What it does**: Find files by name, metadata (time, size, permissions), with sorting.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **Default excludes** | `path: "<target>"` (no `excludeDir`) | No `node_modules/`, `dist/`, `.git/` in results |
| 2 | **Disable excludes** | `excludeDir: []` | `dist/` or `node_modules/` files now appear (more results than test 1) |
| 3 | **Sort by size** | `sortBy: "size"`, `type: "f"` | Largest files first; `files[0].size >= files[1].size` |
| 4 | **Sort by name** | `sortBy: "name"` | Alphabetical by filename |
| 5 | **Sort by path** | `sortBy: "path"` | Alphabetical by full path |
| 6 | **Time filter** | `modifiedWithin: "7d"` | Only recently modified files returned |
| 7 | **Size filter** | `sizeGreater: "10k"`, `type: "f"` | All returned files have `size > 10240` |
| 8 | **Name search** | `name: "*.config.*"` | Only config files returned |
| 9 | **Recursive name** | `name: "index.ts"` | Finds all `index.ts` across nested dirs |
| 10 | **Pagination** | `filesPerPage: 5`, then `filePageNumber: 2` | Different files on each page; `hasMore` correct |

### Pass Criteria

Default excludes active when no `excludeDir`. All 4 sort modes work. Filters are additive (AND logic).

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 10 pass, default excludes work, `excludeDir: []` disables them, all sort modes correct |
| 9 | 9-10 pass; minor edge (e.g. `sortBy: "name"` sorts by path instead of basename) |
| 8 | No `sortBy` parameter — hard-coded modified sort only |
| 7 | No default excludes — `dist/` and `node_modules/` pollute results |
| ≤6 | Filters broken, time/size queries fail, pagination wrong |

---

## 4. `localGetFileContent` (file reading)

**What it does**: Read file content with matchString targeting, line ranges, or full content.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **matchString** | `matchString: "export"`, `matchStringContextLines: 10` | Returns lines around match; content is **readable with indentation preserved** |
| 2 | **Case-insensitive match** | `matchString: "EXPORT"`, `matchStringCaseSensitive: false` | Matches lowercase `export` |
| 3 | **Line range** | `startLine: 1`, `endLine: 30` | Returns exactly lines 1-30; `extractedLines: 30` |
| 4 | **Full content (small)** | `fullContent: true` on a file < 200 lines | Complete content; `isPartial: false` |
| 5 | **Full content (large)** | `fullContent: true` on a file > 500 lines | Auto-paginated; `charPagination` present |
| 6 | **TS/JS indentation** | Read any `.ts` file with `matchString` | Indentation (2/4 spaces) preserved — NOT collapsed to single line |
| 7 | **No match** | `matchString: "xyzzy_nonexistent"` | Graceful empty/no-match result, not an error |

### Pass Criteria

All content readable with proper line breaks and indentation. TS/JS files NOT aggressively minified. `matchStringCaseSensitive` defaults to `false`.

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 7 pass, TS indentation preserved, case-insensitive by default, pagination clean |
| 9 | 6-7 pass; auto-pagination triggers warning on small files (cosmetic) |
| 8 | matchString works but case-insensitive fails, or context lines off |
| 7 | TS/JS content collapsed to single line (aggressive minification) |
| ≤6 | matchString broken, line ranges wrong, crashes on large files |

---

## 5. `lspGotoDefinition` (semantic)

**What it does**: Jump to the definition of a symbol using Language Server Protocol.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **Search → Define** | `localSearchCode` first, then `lspGotoDefinition` with `lineHint` from results | Definition location returned with context snippet |
| 2 | **Import resolution** | Target an imported symbol | Resolves to import statement or original definition file |
| 3 | **Class/interface** | Target a class name | Returns class declaration location |
| 4 | **Wrong lineHint** | `lineHint` off by 20+ lines | `status: "empty"`, `errorType: "symbol_not_found"`, search radius hint |
| 5 | **Context snippet** | Any successful query | `content` field has `>` markers on definition lines, plain context lines around |

### Pass Criteria

Requires `lineHint` from prior search (never guess). Definition locations accurate. Context snippets readable.

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 5 pass, cross-file resolution works, context snippets have `>` markers |
| 9 | 4-5 pass; resolves to import statement rather than source definition (TS server behavior — requires chaining) |
| 8 | Works for local symbols but fails cross-file |
| 7 | LSP not available — falls back to pattern matching with partial accuracy |
| ≤6 | Symbol resolution fails, no fallback, crashes on missing lineHint |

---

## 6. `lspFindReferences` (semantic)

**What it does**: Find all usages of a symbol across the codebase.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **Search → References** | `localSearchCode` first, then `lspFindReferences` with `lineHint` | Multiple locations returned across files |
| 2 | **Definition flag** | Check results for `isDefinition` field | Exactly one result marked `isDefinition: true` |
| 3 | **Cross-file** | Use on an exported symbol | `hasMultipleFiles: true`; references span source + test files |
| 4 | **Pagination** | Query a widely-used symbol | `totalReferences > 20`; `hasMore: true`; `page: 2` returns more |
| 5 | **Wrong lineHint** | Intentionally wrong line | `symbol_not_found` error with actionable hints |
| 6 | **Include/exclude patterns** | `includePattern: ["**/src/**"]` | Only source files returned, no test files |

### Pass Criteria

Returns definition + usages. Pagination works. Always requires `lineHint` from search.

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 6 pass, `isDefinition` flag accurate, include/exclude patterns work, pagination correct |
| 9 | 5-6 pass; minor (e.g. no `isDefinition` flag but locations correct) |
| 8 | References found but no cross-file, or pagination broken |
| 7 | Works only when lineHint is exact (no search radius tolerance) |
| ≤6 | Returns empty for valid symbols, no error hints, crashes |

---

## 7. `lspCallHierarchy` (semantic)

**What it does**: Trace function call relationships — who calls a function and what it calls.

### Tests

| # | Test | Query | What to Verify |
|:-:|:-----|:------|:---------------|
| 1 | **Incoming calls** | `direction: "incoming"` on a utility function | Shows which functions call this one; includes exact `fromRanges` (line+character) |
| 2 | **Outgoing calls** | `direction: "outgoing"` on a main/entry function | Shows all functions it calls; resolves to actual definition files |
| 3 | **Cross-file** | Target a function called from other files | Incoming calls reference different URIs |
| 4 | **Node.js builtins** | Target a function that calls `readFile` or `fetch` | Outgoing resolves to `node_modules/@types/` or built-in `.d.ts` |
| 5 | **Function context** | Any successful query | `item.content` shows full function body with `>` markers |
| 6 | **Non-function symbol** | Use on a variable or type (not a function) | Falls back to pattern matching or returns empty with actionable hints |

### Pass Criteria

Incoming/outgoing both work. Call sites include precise `fromRanges`. Cross-file resolution works.

### Scoring Guide

| Score | Criteria |
|:-----:|:---------|
| 10 | All 6 pass, full function body in context, cross-file + builtin resolution |
| 9 | 5-6 pass; builtin resolution shows `.d.ts` content (verbose but correct) |
| 8 | Incoming works but outgoing misses some calls, or pattern fallback inaccurate |
| 7 | LSP unavailable — pattern matching fallback with partial results |
| ≤6 | Direction parameter ignored, crashes on non-function, no fallback |

---

## Quick Validation Sequence

Run these 7 steps in order for a fast smoke test on **any repo**:

```
1. localViewStructure    → path="<root>", depth=1
   ✓ Lists files and dirs

2. localSearchCode       → pattern="function", mode="discovery", path="<root>/src"
   ✓ Files found, matchCount >= 1

3. localFindFiles        → path="<root>", name="*.ts", sortBy="size", type="f"
   ✓ Sorted by size, no dist/node_modules

4. localGetFileContent   → path="<any .ts file>", matchString="export", matchStringContextLines=10
   ✓ Readable content with indentation

5. lspGotoDefinition     → uri="<file from step 2>", symbolName="<from step 2>", lineHint=<from step 2>
   ✓ Definition found

6. lspFindReferences     → uri="<definition from step 5>", symbolName="<same>", lineHint=<from step 5>
   ✓ Multiple references found

7. lspCallHierarchy      → uri="<file>", symbolName="<function>", lineHint=<N>, direction="incoming"
   ✓ Callers found with context
```

Each step feeds into the next — the **Funnel Method**: Structure → Search → Locate → Analyze → Read.

---

## Advanced Validation Pack (Node Modules + Edge Cases)

Run this pack after the Quick Validation Sequence for deeper confidence.

| # | Tool | Advanced Test | Query | What to Verify |
|:-:|:-----|:--------------|:------|:---------------|
| A1 | `localSearchCode` | Node modules direct path | `path: "<root>/node_modules/<pkg>"`, `pattern: "<known symbol>"` | Tool can search vendor files when path is explicit |
| A2 | `localSearchCode` | Empty + complex regex | `pattern: "xyzzy_nonexistent"` and `pattern: "export (class\\|interface) \\w+"` | Empty returns helpful hints; regex alternation works |
| A3 | `localViewStructure` | Node modules browse | `path: "<root>/node_modules/<pkg>"`, `depth: 1` | Directory tree renders with `[DIR]`/`[FILE]` and pagination metadata |
| A4 | `localFindFiles` | Exclude behavior verification | `path: "<root>"` then `excludeDir: []` | Default excludes active; disabling excludes changes scope in your environment |
| A5 | `localFindFiles` | Metadata stress | `sizeGreater: "10k"`, `modifiedWithin: "7d"`, `sortBy: "size"` | Filters combine correctly (AND logic), sorting remains valid |
| A6 | `localGetFileContent` | Node modules file read | `path: "<root>/node_modules/<pkg>/package.json"`, `fullContent: true` | Reads vendor file safely; pagination/partial flags are coherent |
| A7 | `localGetFileContent` | Regex + case-insensitive | `matchStringIsRegex: true`, `matchStringCaseSensitive: false` | Match targeting works without collapsing indentation |
| A8 | `lspGotoDefinition` | Import chaining regression | Query imported symbol in same file | Second hop resolves to source definition when available |
| A9 | `lspFindReferences` | Include/exclude patterns | `includePattern` / `excludePattern` on same symbol | Pattern filters narrow result set as expected |
| A10 | `lspCallHierarchy` | Non-function + depth=2 | Run on type/variable then function with `depth: 2` | Non-function handled gracefully; deep call graph remains stable |

### Advanced Pass Criteria

- Node modules can be tested when explicitly targeted by path.
- Advanced edge cases are stable (empty results, regex, pagination, include/exclude patterns).
- LSP tools maintain graceful behavior on non-function symbols and import-heavy flows.

### Advanced Scoring Add-on (Optional)

| Score | Criteria |
|:-----:|:---------|
| +5 | All A1-A10 pass with actionable hints and no crashes |
| +3 | 8-9 pass; minor environment-specific caveat (for example default exclude behavior differences) |
| +1 | 6-7 pass; some advanced filters or chaining cases inconsistent |
| +0 | <6 pass or crashes in advanced flows |

---

## Scoring Summary Template

Use this table to record scores for any repo:

| Tool | Score | Tests Passed | Notes |
|:-----|:-----:|:------------:|:------|
| `localSearchCode` | /10 | /8 | |
| `localViewStructure` | /10 | /9 | |
| `localFindFiles` | /10 | /10 | |
| `localGetFileContent` | /10 | /7 | |
| `lspGotoDefinition` | /10 | /5 | |
| `lspFindReferences` | /10 | /6 | |
| `lspCallHierarchy` | /10 | /6 | |
| **TOTAL** | **/70** | **/51** | |

**Thresholds**:
- **63-70** (90%+): Production-ready, all features working
- **56-62** (80%+): Functional with minor gaps — document known issues
- **49-55** (70%+): Usable but needs fixes — check scoring guides for deductions
- **<49** (<70%): Significant issues — investigate before production use

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|:--------|:-------------|:----|
| LSP returns `symbol_not_found` | Wrong `lineHint` | Always get `lineHint` from `localSearchCode` first |
| `localFindFiles` returns dist files | `excludeDir: []` passed explicitly | Remove `excludeDir` to use defaults |
| `localGetFileContent` returns single-line blob | Aggressive minification on file type | Check `minifierTypes.ts` strategy for that extension |
| `localViewStructure` shows no dates | `showFileLastModified: false` (default) | Set `showFileLastModified: true` |
| Pagination shows `hasMore: false` on page 1 | Results fit in one page | Reduce `entriesPerPage`/`filesPerPage` to force pagination |
| `lspCallHierarchy` returns empty | Used on a type/variable instead of a function | Use `lspFindReferences` for non-function symbols |
| Discovery mode `matchCount` always 1 | ripgrep `-l` only returns filenames | Use `mode: "detailed"` or `countMatches: true` for real counts |
| LSP tools return no results on Python/Go/etc | Language server not installed | Install the required language server (e.g. `pyright`, `gopls`) |

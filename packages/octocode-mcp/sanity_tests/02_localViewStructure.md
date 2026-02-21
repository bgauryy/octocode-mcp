# Sanity Test: `localViewStructure`

---

## Tool Overview

Displays directory structure of a local path with filtering, sorting, pagination, and detail controls. Supports depth traversal, file/directory-only views, extension filtering, and hidden file visibility.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `entriesPerPage`, `entryPageNumber` parameters
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "depth": 1,
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this structure view",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters
  }]
}
```

### Hints Validation Checklist
- [ ] Response includes helpful hints for navigation
- [ ] Hints suggest next logical steps (e.g., drill into subdirs, file reading)
- [ ] Pagination hints when results are truncated
- [ ] Summary includes file/directory counts

---

## Test Cases

### TC-1: Depth 2

**Goal:** Verify `depth: 2` shows nested directory contents with files.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "depth": 2,
    "mainResearchGoal": "Test depth parameter",
    "researchGoal": "Verify depth 2 shows nested directory contents",
    "reasoning": "Depth controls traversal level for structure exploration"
  }]
}
```

**Expected:**
- [ ] Shows top-level directories and their immediate children
- [ ] Files visible inside subdirectories
- [ ] `totalFiles` and `totalDirectories` populated
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `summary` includes file/directory counts
  - [ ] Hints present with navigation suggestions

---

### TC-2: Files Only

**Goal:** Verify `filesOnly: true` excludes directories from output.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "filesOnly": true,
    "depth": 1,
    "mainResearchGoal": "Test files-only filter",
    "researchGoal": "Verify filesOnly excludes directories from output",
    "reasoning": "Files-only view focuses on file discovery"
  }]
}
```

**Expected:**
- [ ] Only files returned, 0 directories
- [ ] `totalDirectories` is 0 or absent
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes file counts (0 directories)
  - [ ] Hints present with navigation suggestions

---

### TC-3: Directories Only

**Goal:** Verify `directoriesOnly: true` excludes files from output.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "directoriesOnly": true,
    "depth": 1,
    "mainResearchGoal": "Test directories-only filter",
    "researchGoal": "Verify directoriesOnly excludes files",
    "reasoning": "Directories-only view focuses on structure navigation"
  }]
}
```

**Expected:**
- [ ] Only directories returned, 0 files
- [ ] `totalFiles` is 0 or absent
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes directory counts
  - [ ] Hints present with navigation suggestions

---

### TC-4: Single Extension Filter

**Goal:** Verify `extension` filters to a single file type.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "extension": "ts",
    "depth": 2,
    "mainResearchGoal": "Test single extension filter",
    "researchGoal": "Verify extension filters to a single file type",
    "reasoning": "Extension filter narrows results to specific language"
  }]
}
```

**Expected:**
- [ ] Only `.ts` files in results
- [ ] No `.js`, `.json`, `.md`, etc.
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes file counts
  - [ ] Hints present with navigation suggestions

---

### TC-5: Multi Extension Filter

**Goal:** Verify `extensions` accepts multiple file types.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "extensions": ["ts", "json"],
    "depth": 2,
    "mainResearchGoal": "Test multi extension filter",
    "researchGoal": "Verify extensions accepts multiple file types",
    "reasoning": "Multi-extension filter enables cross-language discovery"
  }]
}
```

**Expected:**
- [ ] Only `.ts` and `.json` files in results
- [ ] No other file types
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes file counts
  - [ ] Hints present with navigation suggestions

---

### TC-6: Sort by Size

**Goal:** Verify `sortBy: "size"` orders by file size.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "sortBy": "size",
    "filesOnly": true,
    "depth": 2,
    "mainResearchGoal": "Test sort by size",
    "researchGoal": "Verify sortBy size orders by file size",
    "reasoning": "Size sort surfaces largest files for analysis"
  }]
}
```

**Expected:**
- [ ] Largest files appear first
- [ ] Size information present in output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes file counts
  - [ ] Hints present with navigation suggestions

---

### TC-7: Sort by Name + Reverse

**Goal:** Verify `sortBy: "name"` with `reverse: true` gives Z-A ordering.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "sortBy": "name",
    "reverse": true,
    "depth": 1,
    "mainResearchGoal": "Test sort name + reverse",
    "researchGoal": "Verify reverse gives Z-A ordering",
    "reasoning": "Reverse sort enables alternate ordering"
  }]
}
```

**Expected:**
- [ ] Entries sorted Z to A alphabetically
- [ ] Reverse of default name ordering
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-8: Limit Entries

**Goal:** Verify `limit` caps total entries returned.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "limit": 10,
    "depth": 2,
    "mainResearchGoal": "Test limit entries",
    "researchGoal": "Verify limit caps total entries returned",
    "reasoning": "Limit controls output size for large directories"
  }]
}
```

**Expected:**
- [ ] At most 10 entries in output
- [ ] Truncation indicated if more exist
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes file counts
  - [ ] Hints present with navigation suggestions

---

### TC-9: Pattern Filter

**Goal:** Verify `pattern` matches against entry names.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "pattern": "error",
    "depth": 3,
    "mainResearchGoal": "Test pattern filter",
    "researchGoal": "Verify pattern matches entry names",
    "reasoning": "Pattern filter narrows results by name"
  }]
}
```

**Expected:**
- [ ] Only entries with "error" in name returned
- [ ] e.g., `errorCodes.ts`, `errors/` directory
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-10: Entries Per Page Pagination

**Goal:** Verify `entriesPerPage` controls page size.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "entriesPerPage": 5,
    "entryPageNumber": 1,
    "depth": 2,
    "mainResearchGoal": "Test entries per page pagination",
    "researchGoal": "Verify entriesPerPage controls page size",
    "reasoning": "Pagination enables browsing large directories"
  }]
}
```

**Expected:**
- [ ] Max 5 entries returned
- [ ] Pagination metadata shows total pages
- [ ] Can request page 2 with `entryPageNumber: 2`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with pagination navigation suggestions

---

### TC-11: Details Mode

**Goal:** Verify `details: true` shows permissions, sizes, and dates.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "details": true,
    "depth": 1,
    "entriesPerPage": 10,
    "mainResearchGoal": "Test details mode",
    "researchGoal": "Verify details shows permissions, sizes, dates",
    "reasoning": "Details mode provides metadata for file analysis"
  }]
}
```

**Expected:**
- [ ] Permissions visible (e.g., `-rw-r--r--@`)
- [ ] File sizes shown
- [ ] Modification dates shown
- [ ] Output differs from `details: false`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-12: Hidden Files

**Goal:** Verify `hidden: true` shows dotfiles and dotdirs.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "hidden": true,
    "depth": 1,
    "mainResearchGoal": "Test hidden files visibility",
    "researchGoal": "Verify hidden shows dotfiles and dotdirs",
    "reasoning": "Hidden files often contain config and metadata"
  }]
}
```

**Expected:**
- [ ] Dotfiles and dotdirs visible (e.g., `.claude/`, `.context/`, `.git/`, `.gitignore`)
- [ ] Not shown when `hidden: false` or omitted
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-13: Recursive Listing

**Goal:** Verify `recursive: true` shows all nested entries regardless of depth.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/security",
    "recursive": true,
    "entriesPerPage": 30,
    "mainResearchGoal": "Test recursive listing",
    "researchGoal": "Verify recursive shows all nested entries",
    "reasoning": "Recursive enables full tree traversal"
  }]
}
```

**Expected:**
- [ ] All files and directories at all levels shown
- [ ] Deeper nesting than depth-limited listing
- [ ] Includes nested subdirectory contents
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-14: Summary Control

**Goal:** Verify `summary: false` omits summary statistics from output.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "summary": false,
    "depth": 1,
    "mainResearchGoal": "Test summary control",
    "researchGoal": "Verify summary: false omits statistics",
    "reasoning": "Summary toggle controls output verbosity"
  }]
}
```

**Expected:**
- [ ] No `totalFiles`/`totalDirectories` summary
- [ ] Raw entries only
- [ ] Differs from `summary: true` (default) output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Hints present with navigation suggestions

---

### TC-15: Show File Last Modified

**Goal:** Verify `showFileLastModified: true` adds modification timestamps.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "showFileLastModified": true,
    "depth": 1,
    "entriesPerPage": 10,
    "mainResearchGoal": "Test show file last modified",
    "researchGoal": "Verify showFileLastModified adds timestamps",
    "reasoning": "Timestamps aid in recency-based analysis"
  }]
}
```

**Expected:**
- [ ] Modification timestamps visible per entry
- [ ] Not shown when `showFileLastModified: false` (default)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-16: Non-Existent Path (Error)

**Goal:** Verify graceful error handling for invalid path.

```json
{
  "queries": [{
    "path": "/nonexistent/path/that/does/not/exist",
    "depth": 1,
    "mainResearchGoal": "Test non-existent path error handling",
    "researchGoal": "Verify graceful error for invalid path",
    "reasoning": "Error handling prevents cascade failures"
  }]
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about missing path
- [ ] No stack trace or internal details leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with path verification suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-17: FilesOnly + DirectoriesOnly Conflict

**Goal:** Verify behavior when mutually exclusive filters are combined.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "filesOnly": true,
    "directoriesOnly": true,
    "depth": 1,
    "mainResearchGoal": "Test mutually exclusive filter conflict",
    "researchGoal": "Verify behavior when filesOnly and directoriesOnly combined",
    "reasoning": "Conflict handling validates design"
  }]
}
```

**Expected:**
- [ ] Empty results or error (logically impossible filter)
- [ ] No crash
- [ ] Clear behavior (one takes precedence or both conflict)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Hints present with recovery suggestions

---

### TC-18: CharOffset/CharLength Output Pagination

**Goal:** Verify `charOffset` + `charLength` for paginating large directory outputs.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "depth": 2,
    "charOffset": 0,
    "charLength": 2000,
    "mainResearchGoal": "Test charOffset/charLength pagination",
    "researchGoal": "Verify character-based output pagination",
    "reasoning": "Char pagination useful for large directory trees"
  }]
}
```

**Expected:**
- [ ] Output truncated to ~2000 characters
- [ ] Pagination hint for next charOffset
- [ ] Useful for large directory trees
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints present
  - [ ] Hints suggest actionable next steps (next charOffset)

---

### TC-19: Sort by Extension

**Goal:** Verify `sortBy: "extension"` groups files by file type.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "sortBy": "extension",
    "filesOnly": true,
    "depth": 2,
    "entriesPerPage": 20,
    "mainResearchGoal": "Test sort by extension",
    "researchGoal": "Verify sortBy extension groups by file type",
    "reasoning": "Extension sort groups similar files"
  }]
}
```

**Expected:**
- [ ] Files grouped/sorted by extension
- [ ] `.ts` files together, `.json` together, etc.
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-20: Human Readable Toggle

**Goal:** Verify `humanReadable: false` changes output format from human-friendly to raw.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "humanReadable": false,
    "depth": 1,
    "entriesPerPage": 10,
    "mainResearchGoal": "Test human readable toggle",
    "researchGoal": "Verify humanReadable: false returns raw format",
    "reasoning": "Human readable toggle controls size display format"
  }]
}
```

**Expected:**
- [ ] Output differs from `humanReadable: true` (default)
- [ ] Sizes shown in bytes instead of KB/MB
- [ ] Raw format returned
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-21: Sort by Time (Default)

**Goal:** Verify `sortBy: "time"` (the default sort) orders by modification time.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "sortBy": "time",
    "filesOnly": true,
    "depth": 2,
    "entriesPerPage": 10,
    "mainResearchGoal": "Test sort by time (default)",
    "researchGoal": "Verify sortBy time orders by modification time",
    "reasoning": "Time sort is default for recency-based discovery"
  }]
}
```

**Expected:**
- [ ] Most recently modified files appear first
- [ ] Same behavior as omitting `sortBy` (since "time" is default)
- [ ] Order differs from name/size/extension sort
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-22: Depth Maximum (Boundary)

**Goal:** Verify `depth: 5` (maximum) shows deeply nested content.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp",
    "depth": 5,
    "entriesPerPage": 30,
    "mainResearchGoal": "Test depth maximum (boundary)",
    "researchGoal": "Verify depth 5 shows deeply nested content",
    "reasoning": "Boundary test ensures max depth handled"
  }]
}
```

**Expected:**
- [ ] Shows content up to 5 levels deep
- [ ] No timeout or error at maximum depth
- [ ] Deeply nested files visible (e.g., src/tools/*/execution.ts)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-23: Entries Per Page Maximum (Boundary)

**Goal:** Verify `entriesPerPage: 50` (maximum) works correctly.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "entriesPerPage": 50,
    "depth": 2,
    "mainResearchGoal": "Test entries per page maximum (boundary)",
    "researchGoal": "Verify entriesPerPage 50 works correctly",
    "reasoning": "Boundary test ensures max pagination handled"
  }]
}
```

**Expected:**
- [ ] Up to 50 entries returned
- [ ] No timeout or error at maximum value
- [ ] All entries valid files/directories
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with pagination suggestions

---

### TC-24: Entries Per Page Minimum (Boundary)

**Goal:** Verify `entriesPerPage: 1` (minimum) returns exactly one entry.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "entriesPerPage": 1,
    "depth": 1,
    "mainResearchGoal": "Test entries per page minimum (boundary)",
    "researchGoal": "Verify entriesPerPage 1 returns exactly one entry",
    "reasoning": "Boundary test ensures min pagination handled"
  }]
}
```

**Expected:**
- [ ] Exactly 1 entry returned
- [ ] Pagination shows many more pages available
- [ ] Can page through one-by-one
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints for next page
  - [ ] Hints present with navigation suggestions

---

### TC-25: Limit Maximum (Boundary)

**Goal:** Verify `limit: 10000` (maximum) works correctly.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "limit": 10000,
    "depth": 3,
    "mainResearchGoal": "Test limit maximum (boundary)",
    "researchGoal": "Verify limit 10000 works correctly",
    "reasoning": "Boundary test ensures max limit handled"
  }]
}
```

**Expected:**
- [ ] Returns all entries up to 10000
- [ ] No performance issues or timeout
- [ ] Total count in summary matches actual
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-26: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available results.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "entriesPerPage": 5,
    "entryPageNumber": 999,
    "depth": 1,
    "mainResearchGoal": "Test page beyond available (boundary)",
    "researchGoal": "Verify behavior when requesting non-existent page",
    "reasoning": "Boundary test ensures graceful pagination handling"
  }]
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints indicate boundary
  - [ ] Hints suggest actionable next steps

---

### TC-27: Extension With Leading Dot

**Goal:** Verify `extension` handles both `"ts"` and `".ts"` formats.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "extension": ".ts",
    "depth": 2,
    "mainResearchGoal": "Test extension with leading dot",
    "researchGoal": "Verify extension handles .ts format",
    "reasoning": "Extension format flexibility validation"
  }]
}
```

**Expected:**
- [ ] Either works same as `"ts"` or returns validation error
- [ ] Behavior is clear and documented
- [ ] No crash on leading dot
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions

---

### TC-28: Empty Directory

**Goal:** Verify handling of an empty or nearly-empty directory.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/dist",
    "depth": 1,
    "mainResearchGoal": "Test empty directory handling",
    "researchGoal": "Verify graceful handling of empty directory",
    "reasoning": "Empty directory should not throw"
  }]
}
```

**Expected:**
- [ ] Empty results or minimal entries
- [ ] No error thrown
- [ ] Summary shows 0 files / 0 directories (or appropriate count)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`empty` or `hasResults`)
  - [ ] `summary` includes counts
  - [ ] Hints present with navigation suggestions (e.g., try parent dir)

---

### TC-29: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries — one failure doesn't affect others.

```json
{
  "queries": [
    {"path": "<WORKSPACE_ROOT>", "depth": 1, "entriesPerPage": 5, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify valid query succeeds", "reasoning": "Bulk must isolate errors"},
    {"path": "/nonexistent/path", "depth": 1, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify invalid path returns error", "reasoning": "Error must not affect others"},
    {"path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src", "depth": 2, "entriesPerPage": 5, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify valid query succeeds", "reasoning": "Each result independent"}
  ]
}
```

**Expected:**
- [ ] First and third queries succeed
- [ ] Second query returns error
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array has per-query `status` (hasResults, error, hasResults)
  - [ ] Status-specific hints for each result type
  - [ ] Hints suggest actionable next steps per query

---

### TC-30: Pagination Test (entriesPerPage + entryPageNumber)

**Goal:** Verify `entriesPerPage` + `entryPageNumber` together; page 2 differs from page 1.

**Page 1:**
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "entriesPerPage": 5,
    "entryPageNumber": 1,
    "depth": 2,
    "mainResearchGoal": "Test pagination parameters",
    "researchGoal": "Verify page 1 returns first 5 entries",
    "reasoning": "Pagination enables browsing large directories"
  }]
}
```

**Page 2:**
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "entriesPerPage": 5,
    "entryPageNumber": 2,
    "depth": 2,
    "mainResearchGoal": "Test pagination navigation",
    "researchGoal": "Verify page 2 returns different entries from page 1",
    "reasoning": "Page 2 must not overlap with page 1"
  }]
}
```

**Expected:**
- [ ] Page 1 returns first 5 entries
- [ ] Page 2 returns next 5 entries (different from page 1)
- [ ] No overlap between page 1 and page 2 results
- [ ] Pagination metadata shows current page and total pages
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints for next/previous page
  - [ ] Hints suggest actionable next steps

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Pagination tests** verify `entriesPerPage`, `entryPageNumber` parameters
- [ ] **Hints validation** checks for helpful guidance in all responses

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Depth 2 | ✅ | | ✅ | |
| 2 | Files only | ✅ | | ✅ | |
| 3 | Directories only | ✅ | | ✅ | |
| 4 | Single extension | ✅ | | ✅ | |
| 5 | Multi extension | ✅ | | ✅ | |
| 6 | Sort by size | ✅ | | ✅ | |
| 7 | Sort name + reverse | ✅ | | ✅ | |
| 8 | Limit entries | ✅ | | ✅ | |
| 9 | Pattern filter | ✅ | | ✅ | |
| 10 | Entries per page | ✅ | ✅ | ✅ | |
| 11 | Details mode | ✅ | | ✅ | |
| 12 | Hidden files | ✅ | | ✅ | |
| 13 | Recursive listing | ✅ | | ✅ | |
| 14 | Summary control | ✅ | | ✅ | |
| 15 | Show file last modified | ✅ | | ✅ | |
| 16 | Non-existent path (error) | ✅ | | ✅ | |
| 17 | FilesOnly + DirectoriesOnly conflict | ✅ | | ✅ | |
| 18 | CharOffset/CharLength pagination | ✅ | ✅ | ✅ | |
| 19 | Sort by extension | ✅ | | ✅ | |
| 20 | Human readable toggle | ✅ | | ✅ | |
| 21 | Sort by time (default) | ✅ | | ✅ | |
| 22 | Depth maximum (boundary) | ✅ | | ✅ | |
| 23 | Entries per page maximum (boundary) | ✅ | ✅ | ✅ | |
| 24 | Entries per page minimum (boundary) | ✅ | ✅ | ✅ | |
| 25 | Limit maximum (boundary) | ✅ | | ✅ | |
| 26 | Page beyond available (boundary) | ✅ | ✅ | ✅ | |
| 27 | Extension with leading dot | ✅ | | ✅ | |
| 28 | Empty directory | ✅ | | ✅ | |
| 29 | Bulk queries (error isolation) | ✅ | | ✅ | |
| 30 | Pagination (entriesPerPage + entryPageNumber) | ✅ | ✅ | ✅ | |

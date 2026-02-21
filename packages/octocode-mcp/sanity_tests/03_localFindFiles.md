# Sanity Test: `localFindFiles`


---

## Tool Overview

Finds files by name, metadata (size, timestamps, permissions), and regex patterns. Supports pagination, sorting, and depth control. Wraps `find` command with structured output.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `filesPerPage`, `filePageNumber`, `limit` parameters
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "pattern",
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this file search",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters
  }]
}
```

### Hints Validation Checklist
- [ ] Response includes helpful hints for file analysis
- [ ] Hints suggest next logical steps (e.g., file reading, content search)
- [ ] Pagination hints when results are truncated
- [ ] File metadata insights in hints (size, modification patterns)

---

## Test Cases

### TC-1: Name Glob Pattern

**Goal:** Verify `name` glob finds matching files.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.test.ts",
    "mainResearchGoal": "Test name glob pattern functionality",
    "researchGoal": "Find all TypeScript test files using glob pattern",
    "reasoning": "Name glob is the primary file discovery method for pattern-based searches"
  }]
}
```

**Expected:**
- [ ] Returns all `.test.ts` files
- [ ] File count > 0 (expected ~200+)
- [ ] Pagination metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints about file analysis
  - [ ] Hints suggest content search or file reading next steps
  - [ ] File count and pattern insights in hints

---

### TC-2: Max Depth

**Goal:** Verify `maxDepth` limits directory traversal depth.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "maxDepth": 3,
    "mainResearchGoal": "Test max depth parameter",
    "researchGoal": "Verify maxDepth limits directory traversal",
    "reasoning": "Max depth controls search scope"
  }]
}
```

**Expected:**
- [ ] Only files within 3 levels of the root
- [ ] Fewer results than unlimited depth
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-3: Sort by Modified

**Goal:** Verify `sortBy: "modified"` returns most recently changed first.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "sortBy": "modified",
    "filesPerPage": 5,
    "mainResearchGoal": "Test sort by modified",
    "researchGoal": "Verify sortBy modified returns most recently changed first",
    "reasoning": "Modified sort surfaces recent changes"
  }]
}
```

**Expected:**
- [ ] Most recently modified files first
- [ ] Modification timestamps in output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-4: Files Per Page Pagination

**Goal:** Verify `filesPerPage` limits page size.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "filesPerPage": 5,
    "filePageNumber": 1,
    "mainResearchGoal": "Test pagination functionality",
    "researchGoal": "Verify filesPerPage limits and page navigation",
    "reasoning": "Pagination is essential for managing large result sets efficiently"
  }]
}
```

**Expected:**
- [ ] Max 5 files returned
- [ ] Pagination shows total count and pages
- [ ] Page 2 (`filePageNumber: 2`) returns different files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints present
  - [ ] Hints suggest actionable next steps
- [ ] **Hints Validation:**
  - [ ] Pagination navigation hints ("Next page: filePageNumber: 2")
  - [ ] Total files summary in hints
  - [ ] Suggestions for filtering if too many results

---

### TC-5: Case-Insensitive Name Search

**Goal:** Verify `iname` performs case-insensitive matching.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "iname": "README*",
    "mainResearchGoal": "Test case-insensitive name search",
    "researchGoal": "Verify iname performs case-insensitive matching",
    "reasoning": "Case-insensitive enables flexible file discovery"
  }]
}
```

**Expected:**
- [ ] Matches `README.md`, `readme.md`, `Readme.md`, etc.
- [ ] At least 2 README files found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-6: File Type Filter

**Goal:** Verify `type: "f"` returns only regular files.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "type": "f",
    "name": "*.json",
    "filesPerPage": 10,
    "mainResearchGoal": "Test file type filter",
    "researchGoal": "Verify type f returns only regular files",
    "reasoning": "Type filter excludes directories and symlinks"
  }]
}
```

**Expected:**
- [ ] Only regular files, no directories or symlinks
- [ ] All entries are `.json` files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-7: Regex with posix-extended

**Goal:** Verify `regex` + `regexType: "posix-extended"` works.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "regex": "\\.(test|spec)\\.ts$",
    "regexType": "posix-extended",
    "mainResearchGoal": "Test regex with posix-extended",
    "researchGoal": "Verify regex + regexType posix-extended works",
    "reasoning": "Regex enables flexible filename matching"
  }]
}
```

**Expected:**
- [ ] Matches both `.test.ts` and `.spec.ts` files
- [ ] No error (previously blocked by security layer)
- [ ] File count > 0 (expected ~200+)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-8: Size Greater Than

**Goal:** Verify `sizeGreater` filters by minimum size.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "sizeGreater": "5k",
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test size greater than filter",
    "researchGoal": "Verify sizeGreater filters by minimum size",
    "reasoning": "Size filter finds larger files"
  }]
}
```

**Expected:**
- [ ] All returned files are > 5KB
- [ ] File details show sizes above threshold
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-9: Size Less Than

**Goal:** Verify `sizeLess` filters by maximum size.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "sizeLess": "15k",
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test size less than filter",
    "researchGoal": "Verify sizeLess filters by maximum size",
    "reasoning": "Size filter finds smaller files"
  }]
}
```

**Expected:**
- [ ] All returned files are < 15KB
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-10: Size Range (Combined)

**Goal:** Verify combining `sizeGreater` + `sizeLess` for a range.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "sizeGreater": "5k",
    "sizeLess": "15k",
    "type": "f",
    "mainResearchGoal": "Test size range (combined)",
    "researchGoal": "Verify sizeGreater + sizeLess for range",
    "reasoning": "Combined size filters narrow results"
  }]
}
```

**Expected:**
- [ ] All files between 5KB and 15KB
- [ ] Expected ~90 files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-11: Multi-Name Search

**Goal:** Verify `names` array searches for multiple filenames.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "names": ["package.json", "tsconfig.json"],
    "mainResearchGoal": "Test multi-name search",
    "researchGoal": "Verify names array searches for multiple filenames",
    "reasoning": "Multi-name enables batch file discovery"
  }]
}
```

**Expected:**
- [ ] Both `package.json` and `tsconfig.json` files found
- [ ] Results from multiple directories
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-12: Sort by Name

**Goal:** Verify `sortBy: "name"` gives alphabetical ordering.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "sortBy": "name",
    "filesPerPage": 10,
    "mainResearchGoal": "Test sort by name",
    "researchGoal": "Verify sortBy name gives alphabetical ordering",
    "reasoning": "Name sort enables predictable ordering"
  }]
}
```

**Expected:**
- [ ] Alphabetical ordering of file paths
- [ ] Consistent ordering across runs
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-13: Sort by Size

**Goal:** Verify `sortBy: "size"` orders by file size.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "type": "f",
    "sortBy": "size",
    "filesPerPage": 10,
    "mainResearchGoal": "Test sort by size",
    "researchGoal": "Verify sortBy size orders by file size",
    "reasoning": "Size sort surfaces largest files"
  }]
}
```

**Expected:**
- [ ] Largest files first
- [ ] Size metadata visible per file
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-14: Details Output

**Goal:** Verify `details: true` returns file metadata.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "details": true,
    "filesPerPage": 5,
    "mainResearchGoal": "Test details output",
    "researchGoal": "Verify details returns file metadata",
    "reasoning": "Details mode provides metadata for analysis"
  }]
}
```

**Expected:**
- [ ] Each file includes modification date, size, permissions
- [ ] `showFileLastModified` metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-15: Min Depth

**Goal:** Verify `minDepth` skips shallow directory levels.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "minDepth": 4,
    "filesPerPage": 10,
    "mainResearchGoal": "Test min depth",
    "researchGoal": "Verify minDepth skips shallow levels",
    "reasoning": "Min depth finds deeply nested files"
  }]
}
```

**Expected:**
- [ ] No files from levels 1-3
- [ ] Only deeply nested files returned
- [ ] Fewer results than without minDepth
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-16: Path Pattern

**Goal:** Verify `pathPattern` matches against the full file path.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "pathPattern": "*/security/*",
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test path pattern",
    "researchGoal": "Verify pathPattern matches full path",
    "reasoning": "Path pattern narrows by directory structure"
  }]
}
```

**Expected:**
- [ ] Only files with "security" in their path
- [ ] Matches files like `src/security/pathValidator.ts`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-17: Empty Files

**Goal:** Verify `empty: true` finds files with zero bytes.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "empty": true,
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test empty files filter",
    "researchGoal": "Verify empty finds zero-byte files",
    "reasoning": "Empty filter finds placeholder or stub files"
  }]
}
```

**Expected:**
- [ ] Only empty (0 byte) files returned
- [ ] Or no results if no empty files exist
- [ ] No error thrown
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-18: Modified Within

**Goal:** Verify `modifiedWithin` filters files changed recently.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "modifiedWithin": "7d",
    "type": "f",
    "name": "*.ts",
    "filesPerPage": 10,
    "mainResearchGoal": "Test modified within filter",
    "researchGoal": "Verify modifiedWithin filters recently changed files",
    "reasoning": "Time filter surfaces recent changes"
  }]
}
```

**Expected:**
- [ ] Only files modified in the last 7 days
- [ ] Modification timestamps confirm filter
- [ ] Recent files appear in results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-19: Modified Before

**Goal:** Verify `modifiedBefore` filters files NOT changed recently.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "modifiedBefore": "30d",
    "type": "f",
    "name": "*.ts",
    "filesPerPage": 10,
    "mainResearchGoal": "Test modified before filter",
    "researchGoal": "Verify modifiedBefore filters older files",
    "reasoning": "Modified before finds stale files"
  }]
}
```

**Expected:**
- [ ] Only files NOT modified in the last 30 days
- [ ] Older files in results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-20: Executable Files

**Goal:** Verify `executable: true` finds executable files.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "executable": true,
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test executable files filter",
    "researchGoal": "Verify executable finds executable files",
    "reasoning": "Executable filter finds scripts and binaries"
  }]
}
```

**Expected:**
- [ ] Only files with execute permission
- [ ] May include shell scripts or binaries
- [ ] Or empty if no executable files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-21: Exclude Directory

**Goal:** Verify `excludeDir` removes specific directories from search.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "excludeDir": ["node_modules", "dist", "coverage"],
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test exclude directory",
    "researchGoal": "Verify excludeDir removes directories from search",
    "reasoning": "Exclude dir narrows to source code"
  }]
}
```

**Expected:**
- [ ] No files from `node_modules/`, `dist/`, or `coverage/`
- [ ] Only source/test TypeScript files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-22: Limit Results

**Goal:** Verify `limit` caps total results regardless of pagination.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "limit": 20,
    "type": "f",
    "mainResearchGoal": "Test limit results",
    "researchGoal": "Verify limit caps total results",
    "reasoning": "Limit controls result set size"
  }]
}
```

**Expected:**
- [ ] At most 20 files returned total
- [ ] Pagination reflects the limit
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-23: Non-Existent Path (Error)

**Goal:** Verify graceful error when path does not exist (within workspace).

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/nonexistent_path_xyz_123",
    "name": "*.ts",
    "mainResearchGoal": "Test non-existent path error",
    "researchGoal": "Verify graceful error when path does not exist",
    "reasoning": "Error handling prevents cascade failures"
  }]
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error: "No such file or directory" or similar
- [ ] No stack trace or internal details leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with path verification suggestions
  - [ ] Hints suggest actionable next steps

**Note:** Use path within workspace. Paths outside workspace (e.g. `/nonexistent/...`) get "Path outside allowed directories" instead.

---

### TC-24: Invalid Regex (Error)

**Goal:** Verify graceful handling of malformed regex.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "regex": "[invalid(regex",
    "mainResearchGoal": "Test invalid regex error",
    "researchGoal": "Verify graceful handling of malformed regex",
    "reasoning": "Regex validation prevents tool failure"
  }]
}
```

**Expected:**
- [ ] Error message about invalid regex syntax
- [ ] No crash or timeout
- [ ] Actionable error message
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with regex fix suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-25: Accessed Within

**Goal:** Verify `accessedWithin` filters by access time.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "accessedWithin": "1d",
    "type": "f",
    "name": "*.ts",
    "filesPerPage": 10,
    "mainResearchGoal": "Test accessed within filter",
    "researchGoal": "Verify accessedWithin filters by access time",
    "reasoning": "Access time filter surfaces recently used files"
  }]
}
```

**Expected:**
- [ ] Only files accessed in the last day
- [ ] Results reflect recent file access
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-26: Permissions Filter

**Goal:** Verify `permissions` parameter filters files by permission pattern.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "permissions": "644",
    "type": "f",
    "filesPerPage": 10,
    "mainResearchGoal": "Test permissions filter",
    "researchGoal": "Verify permissions filters by permission pattern",
    "reasoning": "Permissions filter finds specific file modes"
  }]
}
```

**Expected:**
- [ ] Only files with 644 permissions returned
- [ ] Permission metadata confirms filter
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-27: Readable Files

**Goal:** Verify `readable: true` returns only readable files.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "readable": true,
    "type": "f",
    "name": "*.ts",
    "filesPerPage": 10,
    "mainResearchGoal": "Test readable files filter",
    "researchGoal": "Verify readable returns only readable files",
    "reasoning": "Readable filter ensures accessible files"
  }]
}
```

**Expected:**
- [ ] All returned files are readable
- [ ] No permission-denied entries
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-28: Writable Files

**Goal:** Verify `writable: true` returns only writable files.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "writable": true,
    "type": "f",
    "name": "*.ts",
    "filesPerPage": 10,
    "mainResearchGoal": "Test writable files filter",
    "researchGoal": "Verify writable returns only writable files",
    "reasoning": "Writable filter finds editable files"
  }]
}
```

**Expected:**
- [ ] All returned files have write permission
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-29: CharOffset/CharLength Pagination

**Goal:** Verify `charOffset` + `charLength` for character-based output pagination.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "type": "f",
    "charOffset": 0,
    "charLength": 2000,
    "mainResearchGoal": "Test charOffset/charLength pagination",
    "researchGoal": "Verify character-based output pagination",
    "reasoning": "Char pagination useful for large result sets"
  }]
}
```

**Expected:**
- [ ] Output truncated to ~2000 characters
- [ ] Pagination hint for next charOffset
- [ ] Useful for large result sets
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints for next charOffset
  - [ ] Hints suggest actionable next steps

---

### TC-30: CharOffset Page 2

**Goal:** Verify navigating to page 2 via `charOffset`.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "type": "f",
    "charOffset": 2000,
    "charLength": 2000,
    "mainResearchGoal": "Test charOffset page 2",
    "researchGoal": "Verify navigating to page 2 via charOffset",
    "reasoning": "CharOffset pagination enables content navigation"
  }]
}
```

**Expected:**
- [ ] Characters 2000-3999 returned
- [ ] Content does not overlap with TC-29
- [ ] Pagination indicates current position
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints present
  - [ ] Hints suggest actionable next steps

---

### TC-31: Show File Last Modified

**Goal:** Verify `showFileLastModified` parameter controls timestamp display.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "showFileLastModified": true,
    "filesPerPage": 5,
    "mainResearchGoal": "Test show file last modified",
    "researchGoal": "Verify showFileLastModified controls timestamp display",
    "reasoning": "Timestamps aid in recency-based analysis"
  }]
}
```

**Expected:**
- [ ] Modification timestamps visible per file
- [ ] Differs from showFileLastModified: false
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-32: Sort by Path

**Goal:** Verify `sortBy: "path"` orders results by full path.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "sortBy": "path",
    "filesPerPage": 10,
    "mainResearchGoal": "Test sort by path",
    "researchGoal": "Verify sortBy path orders by full path",
    "reasoning": "Path sort enables predictable ordering"
  }]
}
```

**Expected:**
- [ ] Files ordered alphabetically by full path
- [ ] Consistent ordering
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-33: File Page Navigation (Page 2)

**Goal:** Verify `filePageNumber: 2` returns different files from page 1.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "filesPerPage": 5,
    "filePageNumber": 2,
    "mainResearchGoal": "Test file page navigation",
    "researchGoal": "Verify filePageNumber 2 returns different files",
    "reasoning": "Page navigation enables browsing large result sets"
  }]
}
```

**Expected:**
- [ ] Different files than page 1
- [ ] No overlap with first page
- [ ] Pagination metadata shows current page
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints for next/previous page
  - [ ] Hints suggest actionable next steps

---

### TC-34: Find Directories Only

**Goal:** Verify `type: "d"` returns only directories.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "type": "d",
    "filesPerPage": 10,
    "mainResearchGoal": "Test find directories only",
    "researchGoal": "Verify type d returns only directories",
    "reasoning": "Type d enables directory discovery"
  }]
}
```

**Expected:**
- [ ] Only directories returned, no files
- [ ] Entries like "tools/", "utils/", "security/"
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-35: Find Symlinks Only

**Goal:** Verify `type: "l"` returns only symbolic links.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "type": "l",
    "filesPerPage": 10,
    "mainResearchGoal": "Test find symlinks only",
    "researchGoal": "Verify type l returns only symbolic links",
    "reasoning": "Type l enables symlink discovery"
  }]
}
```

**Expected:**
- [ ] Only symlinks returned (or empty if none exist)
- [ ] No regular files or directories
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-36: MinDepth Greater Than MaxDepth (Validation)

**Goal:** Verify behavior when `minDepth > maxDepth`.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "minDepth": 5,
    "maxDepth": 2,
    "mainResearchGoal": "Test minDepth > maxDepth validation",
    "researchGoal": "Verify behavior when minDepth exceeds maxDepth",
    "reasoning": "Validation ensures logical depth range"
  }]
}
```

**Expected:**
- [ ] Validation error or empty results
- [ ] No crash
- [ ] Clear indication of invalid range
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Error hints with range correction suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-37: FilesPerPage Max Boundary

**Goal:** Verify `filesPerPage: 50` (maximum) works correctly.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "filesPerPage": 50,
    "type": "f",
    "mainResearchGoal": "Test filesPerPage max boundary",
    "researchGoal": "Verify filesPerPage 50 works correctly",
    "reasoning": "Boundary test ensures max pagination handled"
  }]
}
```

**Expected:**
- [ ] Up to 50 files returned
- [ ] No timeout or error
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-38: Limit Max Boundary

**Goal:** Verify `limit: 10000` (maximum) works correctly.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "type": "f",
    "limit": 10000,
    "mainResearchGoal": "Test limit max boundary",
    "researchGoal": "Verify limit 10000 works correctly",
    "reasoning": "Boundary test ensures max limit handled"
  }]
}
```

**Expected:**
- [ ] Returns all files up to 10000
- [ ] No performance issue
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-39: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available results.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "filesPerPage": 5,
    "filePageNumber": 999,
    "mainResearchGoal": "Test page beyond available (boundary)",
    "researchGoal": "Verify behavior when requesting non-existent page",
    "reasoning": "Boundary test ensures graceful pagination handling"
  }]
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints indicate boundary
  - [ ] Hints suggest actionable next steps

---

### TC-40: Empty Results (Valid Path, No Match)

**Goal:** Verify clean handling when no files match on a valid path.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.NONEXISTENT_EXTENSION_XYZ",
    "type": "f",
    "mainResearchGoal": "Test empty results (valid path, no match)",
    "researchGoal": "Verify clean handling when no files match",
    "reasoning": "Empty results should not throw; hints guide recovery"
  }]
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results
- [ ] Clear indication no files found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`empty`)
  - [ ] `emptyStatusHints` present with pattern refinement suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-41: Readable + Writable Combined

**Goal:** Verify combining `readable: true` + `writable: true` narrows results.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "readable": true,
    "writable": true,
    "type": "f",
    "name": "*.ts",
    "filesPerPage": 10,
    "mainResearchGoal": "Test readable + writable combined",
    "researchGoal": "Verify combining readable and writable narrows results",
    "reasoning": "Combined filters find editable source files"
  }]
}
```

**Expected:**
- [ ] Only files with both read and write permissions
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-42: Regex with posix-basic

**Goal:** Verify `regex` + `regexType: "posix-basic"` works with basic regex syntax.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "regex": ".*\\.test\\.ts$",
    "regexType": "posix-basic",
    "mainResearchGoal": "Test regex with posix-basic",
    "researchGoal": "Verify regex + regexType posix-basic works",
    "reasoning": "Posix-basic enables basic regex syntax"
  }]
}
```

**Expected:**
- [ ] Matches `.test.ts` files using POSIX basic regex
- [ ] No error thrown
- [ ] File count > 0
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-43: Regex with posix-egrep

**Goal:** Verify `regex` + `regexType: "posix-egrep"` works with egrep-style regex.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "regex": "\\.(test|spec)\\.ts$",
    "regexType": "posix-egrep",
    "mainResearchGoal": "Test regex with posix-egrep",
    "researchGoal": "Verify regex + regexType posix-egrep works",
    "reasoning": "Posix-egrep enables egrep-style regex"
  }]
}
```

**Expected:**
- [ ] Matches both `.test.ts` and `.spec.ts` files using egrep syntax
- [ ] No error thrown
- [ ] Results similar to TC-7 (posix-extended) since egrep is an alias
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-44: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"path": "<WORKSPACE_ROOT>", "name": "*.ts", "type": "f", "filesPerPage": 3, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify valid query succeeds", "reasoning": "Bulk must isolate errors"},
    {"path": "/nonexistent/path", "name": "*.ts", "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify invalid path returns error", "reasoning": "Error must not affect others"},
    {"path": "<WORKSPACE_ROOT>", "regex": "[invalid(regex", "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify invalid regex returns error", "reasoning": "Each result independent"}
  ]
}
```

**Expected:**
- [ ] First query succeeds
- [ ] Second and third return errors
- [ ] Each result isolated per query
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array has per-query `status` (hasResults, error, error)
  - [ ] Status-specific hints for each result type
  - [ ] Hints suggest actionable next steps per query

---

### TC-45: Comprehensive Pagination Test

**Goal:** Verify all pagination parameters work together correctly.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "filesPerPage": 5,
    "filePageNumber": 1,
    "limit": 20,
    "sortBy": "modified",
    "mainResearchGoal": "Test comprehensive pagination functionality",
    "researchGoal": "Verify interaction of pagination, limits, and sorting",
    "reasoning": "Need to test pagination controls work correctly with sorting and limits"
  }]
}
```

**Expected:**
- [ ] Max 5 files per page
- [ ] Page 1 results (filePageNumber: 1)
- [ ] Total limit of 20 files maximum
- [ ] Files sorted by modification time
- [ ] Pagination metadata shows correct totals
- [ ] **Hints Validation:**
  - [ ] Pagination navigation hints
  - [ ] File analysis suggestions
  - [ ] Sorting and filtering tips

**Follow-up Test - Page 2:**
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>",
    "name": "*.ts",
    "filesPerPage": 5,
    "filePageNumber": 2,
    "limit": 20,
    "sortBy": "modified",
    "mainResearchGoal": "Test pagination navigation",
    "researchGoal": "Verify page 2 returns different files",
    "reasoning": "Pagination should provide non-overlapping result sets"
  }]
}
```

**Expected:**
- [ ] Different files than page 1
- [ ] Consistent sorting across pages
- [ ] No overlap with page 1 results

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Pagination tests** verify `filesPerPage`, `filePageNumber`, `limit` parameters
- [ ] **Hints validation** checks for helpful guidance in all responses

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Name glob | ✅ | - | ✅ | |
| 2 | Max depth | - | - | - | |
| 3 | Sort by modified | - | - | - | |
| 4 | Files per page | ✅ | ✅ | ✅ | |
| 5 | Case-insensitive name | - | - | - | |
| 6 | File type filter | - | - | - | |
| 7 | Regex posix-extended | - | - | - | |
| 8 | Size greater than | - | - | - | |
| 9 | Size less than | - | - | - | |
| 10 | Size range combined | - | - | - | |
| 11 | Multi-name search | - | - | - | |
| 12 | Sort by name | - | - | - | |
| 45 | Comprehensive pagination | ✅ | ✅ | ✅ | |
| 13 | Sort by size | |
| 14 | Details output | |
| 15 | Min depth | |
| 16 | Path pattern | |
| 17 | Empty files | |
| 18 | Modified within | |
| 19 | Modified before | |
| 20 | Executable files | |
| 21 | Exclude directory | |
| 22 | Limit results | |
| 23 | Non-existent path (error) | |
| 24 | Invalid regex (error) | |
| 25 | Accessed within | |
| 26 | Permissions filter | |
| 27 | Readable files | |
| 28 | Writable files | |
| 29 | CharOffset/CharLength pagination | |
| 30 | CharOffset page 2 | |
| 31 | Show file last modified | |
| 32 | Sort by path | |
| 33 | File page navigation (page 2) | |
| 34 | Find directories only | |
| 35 | Find symlinks only | |
| 36 | MinDepth > maxDepth (validation) | |
| 37 | FilesPerPage max boundary | |
| 38 | Limit max boundary | |
| 39 | Page beyond available (boundary) | |
| 40 | Empty results (valid path, no match) | |
| 41 | Readable + writable combined | |
| 42 | Regex posix-basic | |
| 43 | Regex posix-egrep | |
| 44 | Bulk queries (error isolation) | |

# Eval Test: `localFindFiles`

> **Rating: 9/10** | Category: Local | Last tested: Feb 17, 2026

---

## Tool Overview

Finds files by name, metadata (size, timestamps, permissions), and regex patterns. Supports pagination, sorting, and depth control. Wraps `find` command with structured output.

---

## Test Cases

### TC-1: Name Glob Pattern

**Goal:** Verify `name` glob finds matching files.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.test.ts"
}
```

**Expected:**
- [ ] Returns all `.test.ts` files
- [ ] File count > 0 (expected ~200+)
- [ ] Pagination metadata present

---

### TC-2: Max Depth

**Goal:** Verify `maxDepth` limits directory traversal depth.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "maxDepth": 3
}
```

**Expected:**
- [ ] Only files within 3 levels of the root
- [ ] Fewer results than unlimited depth

---

### TC-3: Sort by Modified

**Goal:** Verify `sortBy: "modified"` returns most recently changed first.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "sortBy": "modified",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Most recently modified files first
- [ ] Modification timestamps in output

---

### TC-4: Files Per Page Pagination

**Goal:** Verify `filesPerPage` limits page size.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "filesPerPage": 5,
  "filePageNumber": 1
}
```

**Expected:**
- [ ] Max 5 files returned
- [ ] Pagination shows total count and pages
- [ ] Page 2 (`filePageNumber: 2`) returns different files

---

### TC-5: Case-Insensitive Name Search

**Goal:** Verify `iname` performs case-insensitive matching.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "iname": "README*"
}
```

**Expected:**
- [ ] Matches `README.md`, `readme.md`, `Readme.md`, etc.
- [ ] At least 2 README files found

---

### TC-6: File Type Filter

**Goal:** Verify `type: "f"` returns only regular files.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "type": "f",
  "name": "*.json",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only regular files, no directories or symlinks
- [ ] All entries are `.json` files

---

### TC-7: Regex with posix-extended

**Goal:** Verify `regex` + `regexType: "posix-extended"` works.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "regex": "\\.(test|spec)\\.ts$",
  "regexType": "posix-extended"
}
```

**Expected:**
- [ ] Matches both `.test.ts` and `.spec.ts` files
- [ ] No error (previously blocked by security layer)
- [ ] File count > 0 (expected ~200+)

---

### TC-8: Size Greater Than

**Goal:** Verify `sizeGreater` filters by minimum size.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "sizeGreater": "5k",
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] All returned files are > 5KB
- [ ] File details show sizes above threshold

---

### TC-9: Size Less Than

**Goal:** Verify `sizeLess` filters by maximum size.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "sizeLess": "15k",
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] All returned files are < 15KB

---

### TC-10: Size Range (Combined)

**Goal:** Verify combining `sizeGreater` + `sizeLess` for a range.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "sizeGreater": "5k",
  "sizeLess": "15k",
  "type": "f"
}
```

**Expected:**
- [ ] All files between 5KB and 15KB
- [ ] Expected ~90 files

---

### TC-11: Multi-Name Search

**Goal:** Verify `names` array searches for multiple filenames.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "names": ["package.json", "tsconfig.json"]
}
```

**Expected:**
- [ ] Both `package.json` and `tsconfig.json` files found
- [ ] Results from multiple directories

---

### TC-12: Sort by Name

**Goal:** Verify `sortBy: "name"` gives alphabetical ordering.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "sortBy": "name",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Alphabetical ordering of file paths
- [ ] Consistent ordering across runs

---

### TC-13: Sort by Size

**Goal:** Verify `sortBy: "size"` orders by file size.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "type": "f",
  "sortBy": "size",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Largest files first
- [ ] Size metadata visible per file

---

### TC-14: Details Output

**Goal:** Verify `details: true` returns file metadata.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "details": true,
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Each file includes modification date, size, permissions
- [ ] `showFileLastModified` metadata present

---

### TC-15: Min Depth

**Goal:** Verify `minDepth` skips shallow directory levels.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "minDepth": 4,
  "filesPerPage": 10
}
```

**Expected:**
- [ ] No files from levels 1-3
- [ ] Only deeply nested files returned
- [ ] Fewer results than without minDepth

---

### TC-16: Path Pattern

**Goal:** Verify `pathPattern` matches against the full file path.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "pathPattern": "*/security/*",
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files with "security" in their path
- [ ] Matches files like `src/security/pathValidator.ts`

---

### TC-17: Empty Files

**Goal:** Verify `empty: true` finds files with zero bytes.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "empty": true,
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only empty (0 byte) files returned
- [ ] Or no results if no empty files exist
- [ ] No error thrown

---

### TC-18: Modified Within

**Goal:** Verify `modifiedWithin` filters files changed recently.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "modifiedWithin": "7d",
  "type": "f",
  "name": "*.ts",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files modified in the last 7 days
- [ ] Modification timestamps confirm filter
- [ ] Recent files appear in results

---

### TC-19: Modified Before

**Goal:** Verify `modifiedBefore` filters files NOT changed recently.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "modifiedBefore": "30d",
  "type": "f",
  "name": "*.ts",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files NOT modified in the last 30 days
- [ ] Older files in results

---

### TC-20: Executable Files

**Goal:** Verify `executable: true` finds executable files.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "executable": true,
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files with execute permission
- [ ] May include shell scripts or binaries
- [ ] Or empty if no executable files

---

### TC-21: Exclude Directory

**Goal:** Verify `excludeDir` removes specific directories from search.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "excludeDir": ["node_modules", "dist", "coverage"],
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] No files from `node_modules/`, `dist/`, or `coverage/`
- [ ] Only source/test TypeScript files

---

### TC-22: Limit Results

**Goal:** Verify `limit` caps total results regardless of pagination.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "limit": 20,
  "type": "f"
}
```

**Expected:**
- [ ] At most 20 files returned total
- [ ] Pagination reflects the limit

---

### TC-23: Non-Existent Path (Error)

**Goal:** Verify graceful error for invalid path.

```json
{
  "path": "/nonexistent/path/that/does/not/exist",
  "name": "*.ts"
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about missing path
- [ ] No stack trace or internal details leaked

---

### TC-24: Invalid Regex (Error)

**Goal:** Verify graceful handling of malformed regex.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "regex": "[invalid(regex"
}
```

**Expected:**
- [ ] Error message about invalid regex syntax
- [ ] No crash or timeout
- [ ] Actionable error message

---

### TC-25: Accessed Within

**Goal:** Verify `accessedWithin` filters by access time.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "accessedWithin": "1d",
  "type": "f",
  "name": "*.ts",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files accessed in the last day
- [ ] Results reflect recent file access

---

### TC-26: Permissions Filter

**Goal:** Verify `permissions` parameter filters files by permission pattern.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "permissions": "644",
  "type": "f",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files with 644 permissions returned
- [ ] Permission metadata confirms filter

---

### TC-27: Readable Files

**Goal:** Verify `readable: true` returns only readable files.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "readable": true,
  "type": "f",
  "name": "*.ts",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] All returned files are readable
- [ ] No permission-denied entries

---

### TC-28: Writable Files

**Goal:** Verify `writable: true` returns only writable files.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "writable": true,
  "type": "f",
  "name": "*.ts",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] All returned files have write permission

---

### TC-29: CharOffset/CharLength Pagination

**Goal:** Verify `charOffset` + `charLength` for character-based output pagination.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "type": "f",
  "charOffset": 0,
  "charLength": 2000
}
```

**Expected:**
- [ ] Output truncated to ~2000 characters
- [ ] Pagination hint for next charOffset
- [ ] Useful for large result sets

---

### TC-30: CharOffset Page 2

**Goal:** Verify navigating to page 2 via `charOffset`.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "type": "f",
  "charOffset": 2000,
  "charLength": 2000
}
```

**Expected:**
- [ ] Characters 2000-3999 returned
- [ ] Content does not overlap with TC-29
- [ ] Pagination indicates current position

---

### TC-31: Show File Last Modified

**Goal:** Verify `showFileLastModified` parameter controls timestamp display.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "showFileLastModified": true,
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Modification timestamps visible per file
- [ ] Differs from showFileLastModified: false

---

### TC-32: Sort by Path

**Goal:** Verify `sortBy: "path"` orders results by full path.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "sortBy": "path",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Files ordered alphabetically by full path
- [ ] Consistent ordering

---

### TC-33: File Page Navigation (Page 2)

**Goal:** Verify `filePageNumber: 2` returns different files from page 1.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "filesPerPage": 5,
  "filePageNumber": 2
}
```

**Expected:**
- [ ] Different files than page 1
- [ ] No overlap with first page
- [ ] Pagination metadata shows current page

---

### TC-34: Find Directories Only

**Goal:** Verify `type: "d"` returns only directories.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "type": "d",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only directories returned, no files
- [ ] Entries like "tools/", "utils/", "security/"

---

### TC-35: Find Symlinks Only

**Goal:** Verify `type: "l"` returns only symbolic links.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "type": "l",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only symlinks returned (or empty if none exist)
- [ ] No regular files or directories

---

### TC-36: MinDepth Greater Than MaxDepth (Validation)

**Goal:** Verify behavior when `minDepth > maxDepth`.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "minDepth": 5,
  "maxDepth": 2
}
```

**Expected:**
- [ ] Validation error or empty results
- [ ] No crash
- [ ] Clear indication of invalid range

---

### TC-37: FilesPerPage Max Boundary

**Goal:** Verify `filesPerPage: 50` (maximum) works correctly.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "filesPerPage": 50,
  "type": "f"
}
```

**Expected:**
- [ ] Up to 50 files returned
- [ ] No timeout or error

---

### TC-38: Limit Max Boundary

**Goal:** Verify `limit: 10000` (maximum) works correctly.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "type": "f",
  "limit": 10000
}
```

**Expected:**
- [ ] Returns all files up to 10000
- [ ] No performance issue

---

### TC-39: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available results.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.ts",
  "filesPerPage": 5,
  "filePageNumber": 999
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown

---

### TC-40: Empty Results (Valid Path, No Match)

**Goal:** Verify clean handling when no files match on a valid path.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "name": "*.NONEXISTENT_EXTENSION_XYZ",
  "type": "f"
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results
- [ ] Clear indication no files found

---

### TC-41: Readable + Writable Combined

**Goal:** Verify combining `readable: true` + `writable: true` narrows results.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "readable": true,
  "writable": true,
  "type": "f",
  "name": "*.ts",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Only files with both read and write permissions

---

### TC-42: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"path": "<WORKSPACE_ROOT>", "name": "*.ts", "type": "f", "filesPerPage": 3},
    {"path": "/nonexistent/path", "name": "*.ts"},
    {"path": "<WORKSPACE_ROOT>", "regex": "[invalid(regex"}
  ]
}
```

**Expected:**
- [ ] First query succeeds
- [ ] Second and third return errors
- [ ] Each result isolated per query

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Name glob | |
| 2 | Max depth | |
| 3 | Sort by modified | |
| 4 | Files per page | |
| 5 | Case-insensitive name | |
| 6 | File type filter | |
| 7 | Regex posix-extended | |
| 8 | Size greater than | |
| 9 | Size less than | |
| 10 | Size range combined | |
| 11 | Multi-name search | |
| 12 | Sort by name | |
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
| 42 | Bulk queries (error isolation) | |

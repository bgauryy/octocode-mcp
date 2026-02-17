# Eval Test: `localViewStructure`

> **Rating: 9/10** | Category: Local | Last tested: Feb 17, 2026

---

## Tool Overview

Displays directory structure of a local path with filtering, sorting, pagination, and detail controls. Supports depth traversal, file/directory-only views, extension filtering, and hidden file visibility.

---

## Test Cases

### TC-1: Depth 2

**Goal:** Verify `depth: 2` shows nested directory contents with files.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "depth": 2
}
```

**Expected:**
- [ ] Shows top-level directories and their immediate children
- [ ] Files visible inside subdirectories
- [ ] `totalFiles` and `totalDirectories` populated

---

### TC-2: Files Only

**Goal:** Verify `filesOnly: true` excludes directories from output.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "filesOnly": true,
  "depth": 1
}
```

**Expected:**
- [ ] Only files returned, 0 directories
- [ ] `totalDirectories` is 0 or absent

---

### TC-3: Directories Only

**Goal:** Verify `directoriesOnly: true` excludes files from output.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "directoriesOnly": true,
  "depth": 1
}
```

**Expected:**
- [ ] Only directories returned, 0 files
- [ ] `totalFiles` is 0 or absent

---

### TC-4: Single Extension Filter

**Goal:** Verify `extension` filters to a single file type.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "extension": "ts",
  "depth": 2
}
```

**Expected:**
- [ ] Only `.ts` files in results
- [ ] No `.js`, `.json`, `.md`, etc.

---

### TC-5: Multi Extension Filter

**Goal:** Verify `extensions` accepts multiple file types.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "extensions": ["ts", "json"],
  "depth": 2
}
```

**Expected:**
- [ ] Only `.ts` and `.json` files in results
- [ ] No other file types

---

### TC-6: Sort by Size

**Goal:** Verify `sortBy: "size"` orders by file size.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "sortBy": "size",
  "filesOnly": true,
  "depth": 2
}
```

**Expected:**
- [ ] Largest files appear first
- [ ] Size information present in output

---

### TC-7: Sort by Name + Reverse

**Goal:** Verify `sortBy: "name"` with `reverse: true` gives Z-A ordering.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "sortBy": "name",
  "reverse": true,
  "depth": 1
}
```

**Expected:**
- [ ] Entries sorted Z to A alphabetically
- [ ] Reverse of default name ordering

---

### TC-8: Limit Entries

**Goal:** Verify `limit` caps total entries returned.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "limit": 10,
  "depth": 2
}
```

**Expected:**
- [ ] At most 10 entries in output
- [ ] Truncation indicated if more exist

---

### TC-9: Pattern Filter

**Goal:** Verify `pattern` matches against entry names.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "pattern": "error",
  "depth": 3
}
```

**Expected:**
- [ ] Only entries with "error" in name returned
- [ ] e.g., `errorCodes.ts`, `errors/` directory

---

### TC-10: Entries Per Page Pagination

**Goal:** Verify `entriesPerPage` controls page size.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "entriesPerPage": 5,
  "entryPageNumber": 1,
  "depth": 2
}
```

**Expected:**
- [ ] Max 5 entries returned
- [ ] Pagination metadata shows total pages
- [ ] Can request page 2 with `entryPageNumber: 2`

---

### TC-11: Details Mode

**Goal:** Verify `details: true` shows permissions, sizes, and dates.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "details": true,
  "depth": 1,
  "entriesPerPage": 10
}
```

**Expected:**
- [ ] Permissions visible (e.g., `-rw-r--r--@`)
- [ ] File sizes shown
- [ ] Modification dates shown
- [ ] Output differs from `details: false`

---

### TC-12: Hidden Files

**Goal:** Verify `hidden: true` shows dotfiles and dotdirs.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "hidden": true,
  "depth": 1
}
```

**Expected:**
- [ ] Dotfiles and dotdirs visible (e.g., `.claude/`, `.context/`, `.git/`, `.gitignore`)
- [ ] Not shown when `hidden: false` or omitted

---

### TC-13: Recursive Listing

**Goal:** Verify `recursive: true` shows all nested entries regardless of depth.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/security",
  "recursive": true,
  "entriesPerPage": 30
}
```

**Expected:**
- [ ] All files and directories at all levels shown
- [ ] Deeper nesting than depth-limited listing
- [ ] Includes nested subdirectory contents

---

### TC-14: Summary Control

**Goal:** Verify `summary: false` omits summary statistics from output.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "summary": false,
  "depth": 1
}
```

**Expected:**
- [ ] No `totalFiles`/`totalDirectories` summary
- [ ] Raw entries only
- [ ] Differs from `summary: true` (default) output

---

### TC-15: Show File Last Modified

**Goal:** Verify `showFileLastModified: true` adds modification timestamps.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "showFileLastModified": true,
  "depth": 1,
  "entriesPerPage": 10
}
```

**Expected:**
- [ ] Modification timestamps visible per entry
- [ ] Not shown when `showFileLastModified: false` (default)

---

### TC-16: Non-Existent Path (Error)

**Goal:** Verify graceful error handling for invalid path.

```json
{
  "path": "/nonexistent/path/that/does/not/exist",
  "depth": 1
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about missing path
- [ ] No stack trace or internal details leaked

---

### TC-17: FilesOnly + DirectoriesOnly Conflict

**Goal:** Verify behavior when mutually exclusive filters are combined.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "filesOnly": true,
  "directoriesOnly": true,
  "depth": 1
}
```

**Expected:**
- [ ] Empty results or error (logically impossible filter)
- [ ] No crash
- [ ] Clear behavior (one takes precedence or both conflict)

---

### TC-18: CharOffset/CharLength Output Pagination

**Goal:** Verify `charOffset` + `charLength` for paginating large directory outputs.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "depth": 2,
  "charOffset": 0,
  "charLength": 2000
}
```

**Expected:**
- [ ] Output truncated to ~2000 characters
- [ ] Pagination hint for next charOffset
- [ ] Useful for large directory trees

---

### TC-19: Sort by Extension

**Goal:** Verify `sortBy: "extension"` groups files by file type.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "sortBy": "extension",
  "filesOnly": true,
  "depth": 2,
  "entriesPerPage": 20
}
```

**Expected:**
- [ ] Files grouped/sorted by extension
- [ ] `.ts` files together, `.json` together, etc.

---

### TC-20: Human Readable Toggle

**Goal:** Verify `humanReadable: false` changes output format from human-friendly to raw.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "humanReadable": false,
  "depth": 1,
  "entriesPerPage": 10
}
```

**Expected:**
- [ ] Output differs from `humanReadable: true` (default)
- [ ] Sizes shown in bytes instead of KB/MB
- [ ] Raw format returned

---

### TC-21: Sort by Time (Default)

**Goal:** Verify `sortBy: "time"` (the default sort) orders by modification time.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "sortBy": "time",
  "filesOnly": true,
  "depth": 2,
  "entriesPerPage": 10
}
```

**Expected:**
- [ ] Most recently modified files appear first
- [ ] Same behavior as omitting `sortBy` (since "time" is default)
- [ ] Order differs from name/size/extension sort

---

### TC-22: Depth Maximum (Boundary)

**Goal:** Verify `depth: 5` (maximum) shows deeply nested content.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp",
  "depth": 5,
  "entriesPerPage": 30
}
```

**Expected:**
- [ ] Shows content up to 5 levels deep
- [ ] No timeout or error at maximum depth
- [ ] Deeply nested files visible (e.g., src/tools/*/execution.ts)

---

### TC-23: Entries Per Page Maximum (Boundary)

**Goal:** Verify `entriesPerPage: 50` (maximum) works correctly.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "entriesPerPage": 50,
  "depth": 2
}
```

**Expected:**
- [ ] Up to 50 entries returned
- [ ] No timeout or error at maximum value
- [ ] All entries valid files/directories

---

### TC-24: Entries Per Page Minimum (Boundary)

**Goal:** Verify `entriesPerPage: 1` (minimum) returns exactly one entry.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "entriesPerPage": 1,
  "depth": 1
}
```

**Expected:**
- [ ] Exactly 1 entry returned
- [ ] Pagination shows many more pages available
- [ ] Can page through one-by-one

---

### TC-25: Limit Maximum (Boundary)

**Goal:** Verify `limit: 10000` (maximum) works correctly.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "limit": 10000,
  "depth": 3
}
```

**Expected:**
- [ ] Returns all entries up to 10000
- [ ] No performance issues or timeout
- [ ] Total count in summary matches actual

---

### TC-26: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available results.

```json
{
  "path": "<WORKSPACE_ROOT>",
  "entriesPerPage": 5,
  "entryPageNumber": 999,
  "depth": 1
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total

---

### TC-27: Extension With Leading Dot

**Goal:** Verify `extension` handles both `"ts"` and `".ts"` formats.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
  "extension": ".ts",
  "depth": 2
}
```

**Expected:**
- [ ] Either works same as `"ts"` or returns validation error
- [ ] Behavior is clear and documented
- [ ] No crash on leading dot

---

### TC-28: Empty Directory

**Goal:** Verify handling of an empty or nearly-empty directory.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/dist",
  "depth": 1
}
```

**Expected:**
- [ ] Empty results or minimal entries
- [ ] No error thrown
- [ ] Summary shows 0 files / 0 directories (or appropriate count)

---

### TC-29: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries — one failure doesn't affect others.

```json
{
  "queries": [
    {"path": "<WORKSPACE_ROOT>", "depth": 1, "entriesPerPage": 5},
    {"path": "/nonexistent/path", "depth": 1},
    {"path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src", "depth": 2, "entriesPerPage": 5}
  ]
}
```

**Expected:**
- [ ] First and third queries succeed
- [ ] Second query returns error
- [ ] Each result isolated per query
- [ ] No cascade failure

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Depth 2 | |
| 2 | Files only | |
| 3 | Directories only | |
| 4 | Single extension | |
| 5 | Multi extension | |
| 6 | Sort by size | |
| 7 | Sort name + reverse | |
| 8 | Limit entries | |
| 9 | Pattern filter | |
| 10 | Entries per page | |
| 11 | Details mode | |
| 12 | Hidden files | |
| 13 | Recursive listing | |
| 14 | Summary control | |
| 15 | Show file last modified | |
| 16 | Non-existent path (error) | |
| 17 | FilesOnly + DirectoriesOnly conflict | |
| 18 | CharOffset/CharLength pagination | |
| 19 | Sort by extension | |
| 20 | Human readable toggle | |
| 21 | Sort by time (default) | |
| 22 | Depth maximum (boundary) | |
| 23 | Entries per page maximum (boundary) | |
| 24 | Entries per page minimum (boundary) | |
| 25 | Limit maximum (boundary) | |
| 26 | Page beyond available (boundary) | |
| 27 | Extension with leading dot | |
| 28 | Empty directory | |
| 29 | Bulk queries (error isolation) | |

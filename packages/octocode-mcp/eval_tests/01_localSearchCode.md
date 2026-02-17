# Eval Test: `localSearchCode`

> **Rating: 9/10** | Category: Local | Last tested: Feb 17, 2026

---

## Tool Overview

Searches code in a local repository using ripgrep. Supports three output modes (`discovery`, `paginated`, `detailed`), glob filtering, pagination, and various search options.

---

## Test Cases

### TC-1: Discovery Mode

**Goal:** Verify `mode: "discovery"` returns file-level summary without match content.

```json
{
  "pattern": "export function",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery"
}
```

**Expected:**
- [ ] Returns file-level summary with `matchCount` per file
- [ ] No match content / code snippets in results
- [ ] `totalMatches` and `totalFiles` populated in pagination

---

### TC-2: Paginated Mode

**Goal:** Verify `mode: "paginated"` returns matches with byte/char offsets.

```json
{
  "pattern": "export function",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Matches include byte and character offsets
- [ ] Pagination metadata present (`page`, `totalPages`)
- [ ] Max 5 matches per page

---

### TC-3: Detailed Mode

**Goal:** Verify `mode: "detailed"` returns matches with surrounding context lines.

```json
{
  "pattern": "export function",
  "path": "<WORKSPACE_ROOT>",
  "mode": "detailed",
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] Matches include context lines before/after
- [ ] Richer output than paginated mode
- [ ] Pagination still works

---

### TC-4: Files Only

**Goal:** Verify `filesOnly: true` returns only file paths.

```json
{
  "pattern": "TODO",
  "path": "<WORKSPACE_ROOT>",
  "filesOnly": true
}
```

**Expected:**
- [ ] Only file paths returned (no match content)
- [ ] No code snippets or line numbers

---

### TC-5: Include Glob Filter

**Goal:** Verify `include` glob pattern limits searched files.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>",
  "include": ["*.ts"],
  "mode": "discovery"
}
```

**Expected:**
- [ ] Only `.ts` files in results
- [ ] May include helpful tip ("use type= instead")

---

### TC-6: Exclude Glob Filter

**Goal:** Verify `exclude` glob pattern removes files from results.

```json
{
  "pattern": "describe(",
  "path": "<WORKSPACE_ROOT>",
  "exclude": ["*.test.ts"],
  "mode": "discovery"
}
```

**Expected:**
- [ ] No `.test.ts` files in results
- [ ] Other file types still included

---

### TC-7: Match Content Length

**Goal:** Verify `matchContentLength` controls snippet size.

```json
{
  "pattern": "export class",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchContentLength": 400,
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] Match content extended up to 400 chars (vs default 200)
- [ ] Longer snippets visible

---

### TC-8: Files Per Page

**Goal:** Verify `filesPerPage` limits number of files returned.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "filesPerPage": 3
}
```

**Expected:**
- [ ] Max 3 files in results
- [ ] Pagination indicates more pages available

---

### TC-9: Case Insensitive Search

**Goal:** Verify `caseInsensitive: true` matches regardless of case.

```json
{
  "pattern": "error",
  "path": "<WORKSPACE_ROOT>",
  "caseInsensitive": true,
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Matches `error`, `Error`, `ERROR`, etc.
- [ ] May include priority/precedence warning

---

### TC-10: Max Matches Per File

**Goal:** Verify `maxMatchesPerFile` caps matches within each file.

```json
{
  "pattern": "const",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "maxMatchesPerFile": 2,
  "filesPerPage": 3
}
```

**Expected:**
- [ ] No more than 2 matches from any single file
- [ ] Other files still included

---

### TC-11: Max Files Limit

**Goal:** Verify `maxFiles` limits total files searched.

```json
{
  "pattern": "function",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "maxFiles": 5
}
```

**Expected:**
- [ ] At most 5 files in results

---

### TC-12: Sort by Modified

**Goal:** Verify `sort: "modified"` orders results by modification time.

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "sort": "modified",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Most recently modified files appear first
- [ ] File order differs from default (path) sort

---

### TC-13: Line Numbers

**Goal:** Verify `lineNumbers: true` includes line/column info.

```json
{
  "pattern": "class",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "lineNumbers": true,
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Line and column numbers present per match

---

### TC-14: Fixed String (Non-regex)

**Goal:** Verify `fixedString: true` treats pattern as literal.

```json
{
  "pattern": "Array<string>",
  "path": "<WORKSPACE_ROOT>",
  "fixedString": true,
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] `<` and `>` treated as literal characters, not regex
- [ ] Matches exact string `Array<string>`

---

### TC-15: Multiline Search

**Goal:** Verify `multiline: true` matches patterns spanning lines.

```json
{
  "pattern": "export\\s+function\\s+\\w+",
  "path": "<WORKSPACE_ROOT>",
  "multiline": true,
  "mode": "paginated",
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] Matches that span line boundaries found

---

### TC-16: Whole Word Match

**Goal:** Verify `wholeWord: true` only matches whole words.

```json
{
  "pattern": "error",
  "path": "<WORKSPACE_ROOT>",
  "wholeWord": true,
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Matches `error` but NOT `errorCode`, `isError`, etc.

---

### TC-17: Count + FilesOnly Conflict (Known Issue)

**Goal:** Verify behavior when mutually exclusive params are combined.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>",
  "count": true,
  "filesOnly": true
}
```

**Expected:**
- [ ] Warning about mutually exclusive params
- [ ] `count` silently dropped
- [ ] `filesOnly` behavior takes precedence

**Known Issue:** Count is silently dropped instead of returning count data or producing an error.

---

### TC-18: Invert Match

**Goal:** Verify `invertMatch: true` returns lines NOT matching the pattern.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "invertMatch": true,
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Returned lines do NOT contain "import"
- [ ] Results are the complement of a normal search

---

### TC-19: Context Lines (Before/After)

**Goal:** Verify `beforeContext` and `afterContext` independently control surrounding lines.

```json
{
  "pattern": "export class",
  "path": "<WORKSPACE_ROOT>",
  "mode": "detailed",
  "beforeContext": 2,
  "afterContext": 10,
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] 2 lines shown before each match
- [ ] 10 lines shown after each match
- [ ] Asymmetric context visible

---

### TC-20: File Page Navigation (Page 2)

**Goal:** Verify `filePageNumber: 2` returns different files from page 1.

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "filesPerPage": 5,
  "filePageNumber": 2
}
```

**Expected:**
- [ ] Different files than page 1
- [ ] No overlap with page 1 results
- [ ] Pagination metadata shows current page

---

### TC-21: Exclude Directory

**Goal:** Verify `excludeDir` removes entire directories from search scope.

```json
{
  "pattern": "describe(",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "excludeDir": ["tests", "node_modules"],
  "filesPerPage": 10
}
```

**Expected:**
- [ ] No files from `tests/` or `node_modules/` directories
- [ ] Only source files in results

---

### TC-22: Hidden Files Search

**Goal:** Verify `hidden: true` includes dotfiles in search results.

```json
{
  "pattern": "octocode",
  "path": "<WORKSPACE_ROOT>",
  "hidden": true,
  "mode": "discovery",
  "filesPerPage": 10
}
```

**Expected:**
- [ ] Dotfiles (e.g., `.gitignore`, `.eslintrc`) included if they match
- [ ] More results than with `hidden: false` (default)

---

### TC-23: File Type Filter

**Goal:** Verify `type` parameter filters by ripgrep file type (e.g., "ts" for TypeScript).

```json
{
  "pattern": "function",
  "path": "<WORKSPACE_ROOT>",
  "type": "ts",
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Only TypeScript files in results
- [ ] No `.js`, `.json`, `.md` files
- [ ] Equivalent to `include: ["*.ts"]` but more idiomatic

---

### TC-24: Count Matches

**Goal:** Verify `countMatches: true` returns per-file match counts.

```json
{
  "pattern": "const",
  "path": "<WORKSPACE_ROOT>",
  "countMatches": true,
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Each file shows a numeric match count
- [ ] Counts reflect actual occurrences (not just 1 per file)

---

### TC-25: Sort Reverse

**Goal:** Verify `sortReverse: true` reverses the sort order.

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "sort": "path",
  "sortReverse": true,
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Files sorted Z-A by path (reverse alphabetical)
- [ ] Opposite order from default `sort: "path"`

---

### TC-26: Show File Last Modified

**Goal:** Verify `showFileLastModified: true` adds timestamps to results.

```json
{
  "pattern": "export function",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "showFileLastModified": true,
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Modification timestamps visible per file
- [ ] Not shown when `showFileLastModified: false` (default)

---

### TC-27: Case Sensitive Search

**Goal:** Verify `caseSensitive: true` only matches exact case.

```json
{
  "pattern": "Error",
  "path": "<WORKSPACE_ROOT>",
  "caseSensitive": true,
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Only matches `Error` (capital E)
- [ ] Does NOT match `error`, `ERROR`
- [ ] Overrides `smartCase` default

---

### TC-28: Binary Files Handling

**Goal:** Verify `binaryFiles` parameter controls binary file inclusion.

```json
{
  "pattern": "test",
  "path": "<WORKSPACE_ROOT>",
  "binaryFiles": "without-match",
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Binary files excluded from results (default behavior)
- [ ] Only text files with matches shown

---

### TC-29: Non-Existent Path (Error)

**Goal:** Verify graceful error handling for invalid path.

```json
{
  "pattern": "test",
  "path": "/nonexistent/path/that/does/not/exist"
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about invalid/missing path
- [ ] No stack trace or internal details leaked

---

### TC-30: Invalid Regex Pattern (Error)

**Goal:** Verify graceful handling of malformed regex.

```json
{
  "pattern": "[invalid(regex",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery"
}
```

**Expected:**
- [ ] Error message about invalid regex syntax
- [ ] No crash or timeout
- [ ] Actionable error message

---

### TC-31: Empty Results

**Goal:** Verify clean handling when no files match.

```json
{
  "pattern": "COMPLETELY_UNIQUE_NONEXISTENT_STRING_XYZ_99999",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery"
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results with `totalFiles: 0` or equivalent
- [ ] Clear indication no matches found

---

### TC-32: Files Without Match

**Goal:** Verify `filesWithoutMatch: true` returns files that do NOT contain the pattern.

```json
{
  "pattern": "describe(",
  "path": "<WORKSPACE_ROOT>",
  "filesWithoutMatch": true,
  "include": ["*.ts"],
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Files returned do NOT contain "describe("
- [ ] Useful for finding non-test files

---

### TC-33: Perl Regex (Lookahead/Lookbehind)

**Goal:** Verify `perlRegex: true` enables Perl-compatible regex features.

```json
{
  "pattern": "(?<=export )function \\w+",
  "path": "<WORKSPACE_ROOT>",
  "perlRegex": true,
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Lookahead/lookbehind patterns work
- [ ] Matches only "function X" when preceded by "export "

---

### TC-34: No Ignore (.gitignore bypass)

**Goal:** Verify `noIgnore: true` searches through .gitignore'd files.

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>",
  "noIgnore": true,
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Files normally excluded by .gitignore (e.g., dist/, coverage/) appear in results
- [ ] More results than default

---

### TC-35: Follow Symlinks

**Goal:** Verify `followSymlinks: true` resolves symbolic links during search.

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>",
  "followSymlinks": true,
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Symlinked files/directories included in search
- [ ] No error on symlink traversal

---

### TC-36: Context Lines (Symmetric)

**Goal:** Verify `contextLines` provides symmetric context around matches (unlike beforeContext/afterContext).

```json
{
  "pattern": "export class",
  "path": "<WORKSPACE_ROOT>",
  "mode": "detailed",
  "contextLines": 5,
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] 5 lines before AND 5 lines after each match
- [ ] Symmetric context visible

---

### TC-37: Column Offset Reporting

**Goal:** Verify `column: true` includes column position in match output.

```json
{
  "pattern": "export function",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "column": true,
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Column position present per match
- [ ] Indicates character offset within line

---

### TC-38: Multiline + Dotall Combined

**Goal:** Verify `multiline: true` + `multilineDotall: true` enables dot-matches-newline.

```json
{
  "pattern": "export.*\\{",
  "path": "<WORKSPACE_ROOT>",
  "multiline": true,
  "multilineDotall": true,
  "mode": "paginated",
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] Dot (.) matches newline characters
- [ ] Patterns span across line boundaries

---

### TC-39: Include Stats Toggle

**Goal:** Verify `includeStats: false` omits statistics from output.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "includeStats": false,
  "filesPerPage": 5
}
```

**Expected:**
- [ ] No distribution/stats metadata in output
- [ ] Differs from default (includeStats: true)

---

### TC-40: Include Distribution Toggle

**Goal:** Verify `includeDistribution: false` omits file distribution data.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "includeDistribution": false,
  "filesPerPage": 5
}
```

**Expected:**
- [ ] No distribution breakdown in output
- [ ] Differs from default (includeDistribution: true)

---

### TC-41: Line Regexp (Full Line Match)

**Goal:** Verify `lineRegexp: true` matches only entire lines.

```json
{
  "pattern": "import",
  "path": "<WORKSPACE_ROOT>",
  "lineRegexp": true,
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] Only lines that ARE exactly "import" (nothing else)
- [ ] Not lines containing "import"

---

### TC-42: Smart Case (Default Behavior)

**Goal:** Verify `smartCase: true` (default) — lowercase = insensitive, uppercase = sensitive.

```json
{
  "pattern": "error",
  "path": "<WORKSPACE_ROOT>",
  "smartCase": true,
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Matches "error", "Error", "ERROR" (all-lowercase pattern = case-insensitive)
- [ ] With "Error" as pattern, only exact case matched

---

### TC-43: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting a page that doesn't exist.

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery",
  "filesPerPage": 5,
  "filePageNumber": 999
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total

---

### TC-44: Pattern Max Length (Boundary)

**Goal:** Verify behavior with pattern at maximum length (2000 chars).

```json
{
  "pattern": "<2000_char_string>",
  "path": "<WORKSPACE_ROOT>",
  "mode": "discovery"
}
```

**Expected:**
- [ ] No crash or timeout
- [ ] Empty results expected (no match)
- [ ] Handles gracefully

---

### TC-45: Matches Per Page as Primary

**Goal:** Verify `matchesPerPage` correctly caps per-page match count.

```json
{
  "pattern": "const",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 3
}
```

**Expected:**
- [ ] Max 3 matches returned across all files
- [ ] Pagination metadata shows more available

---

### TC-46: Bulk Queries (Mixed Valid + Invalid)

**Goal:** Verify error isolation in bulk queries — one failure doesn't affect others.

```json
{
  "queries": [
    {
      "pattern": "export",
      "path": "<WORKSPACE_ROOT>",
      "mode": "discovery",
      "filesPerPage": 3
    },
    {
      "pattern": "[invalid(regex",
      "path": "<WORKSPACE_ROOT>",
      "mode": "discovery"
    },
    {
      "pattern": "import",
      "path": "/nonexistent/path"
    }
  ]
}
```

**Expected:**
- [ ] First query succeeds
- [ ] Second and third return errors
- [ ] Each result isolated per query
- [ ] No cascade failure

---

### TC-47: Encoding Parameter

**Goal:** Verify `encoding` parameter for non-UTF8 file search.

```json
{
  "pattern": "test",
  "path": "<WORKSPACE_ROOT>",
  "encoding": "utf-8",
  "mode": "discovery",
  "filesPerPage": 5
}
```

**Expected:**
- [ ] Search completes with specified encoding
- [ ] No encoding errors

---

### TC-48: No Unicode

**Goal:** Verify `noUnicode: true` disables Unicode-aware matching.

```json
{
  "pattern": "\\w+",
  "path": "<WORKSPACE_ROOT>",
  "noUnicode": true,
  "mode": "paginated",
  "matchesPerPage": 5
}
```

**Expected:**
- [ ] \w only matches ASCII word chars (not Unicode letters)
- [ ] May differ from default (Unicode-aware)

---

### TC-49: Passthru Mode

**Goal:** Verify `passthru: true` outputs every line (non-matching lines included).

```json
{
  "pattern": "export",
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "passthru": true,
  "mode": "paginated",
  "matchesPerPage": 20
}
```

**Expected:**
- [ ] Both matching and non-matching lines in output
- [ ] Effectively shows full file with highlights

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Discovery mode | |
| 2 | Paginated mode | |
| 3 | Detailed mode | |
| 4 | Files only | |
| 5 | Include glob | |
| 6 | Exclude glob | |
| 7 | Match content length | |
| 8 | Files per page | |
| 9 | Case insensitive | |
| 10 | Max matches per file | |
| 11 | Max files | |
| 12 | Sort by modified | |
| 13 | Line numbers | |
| 14 | Fixed string | |
| 15 | Multiline | |
| 16 | Whole word | |
| 17 | Count + filesOnly conflict | |
| 18 | Invert match | |
| 19 | Context lines (before/after) | |
| 20 | File page navigation | |
| 21 | Exclude directory | |
| 22 | Hidden files search | |
| 23 | File type filter | |
| 24 | Count matches | |
| 25 | Sort reverse | |
| 26 | Show file last modified | |
| 27 | Case sensitive | |
| 28 | Binary files handling | |
| 29 | Non-existent path (error) | |
| 30 | Invalid regex (error) | |
| 31 | Empty results | |
| 32 | Files without match | |
| 33 | Perl regex (lookahead/lookbehind) | |
| 34 | No ignore (.gitignore bypass) | |
| 35 | Follow symlinks | |
| 36 | Context lines (symmetric) | |
| 37 | Column offset reporting | |
| 38 | Multiline + dotall combined | |
| 39 | Include stats toggle | |
| 40 | Include distribution toggle | |
| 41 | Line regexp (full line match) | |
| 42 | Smart case (default behavior) | |
| 43 | Page beyond available (boundary) | |
| 44 | Pattern max length (boundary) | |
| 45 | Matches per page as primary | |
| 46 | Bulk queries (mixed valid + invalid) | |
| 47 | Encoding parameter | |
| 48 | No unicode | |
| 49 | Passthru mode | |

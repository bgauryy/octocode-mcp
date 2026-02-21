# Sanity Test: `localSearchCode`


---

## Tool Overview

Searches code in a local repository using ripgrep. Supports three output modes (`discovery`, `paginated`, `detailed`), glob filtering, pagination, and various search options.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `matchesPerPage`, `filesPerPage`, `filePageNumber` parameters
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "pattern": "search_pattern",
    "path": "<WORKSPACE_ROOT>",
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this search",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters
  }]
}
```

### Hints Validation Checklist
- [ ] Response includes `hasResultsStatusHints` or `emptyStatusHints`
- [ ] Hints suggest next logical steps (e.g., LSP tools, file reading)
- [ ] Pagination hints when results are truncated
- [ ] Search refinement suggestions for empty results

---

## Test Cases

### TC-1: Discovery Mode

**Goal:** Verify `mode: "discovery"` returns file-level summary without match content.

```json
{
  "queries": [{
    "pattern": "export function",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "mainResearchGoal": "Test discovery mode functionality",
    "researchGoal": "Verify file-level summary output without content",
    "reasoning": "Discovery mode should provide overview without detailed matches"
  }]
}
```

**Expected:**
- [ ] Returns file-level summary with `matchCount` per file
- [ ] No match content / code snippets in results
- [ ] `totalMatches` and `totalFiles` populated in pagination
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints array present (`hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps (LSP tools, file reading, search refinement)
- [ ] **Hints Validation:**
  - [ ] Response includes `hasResultsStatusHints` with guidance
  - [ ] Hints suggest next steps (e.g., "Use mode: 'paginated' for match content")
  - [ ] File count and match statistics in hints

---

### TC-2: Paginated Mode

**Goal:** Verify `mode: "paginated"` returns matches with byte/char offsets.

```json
{
  "queries": [{
    "pattern": "export function",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test paginated mode with match content",
    "researchGoal": "Verify byte/char offsets and pagination controls",
    "reasoning": "Paginated mode needed for detailed match analysis with controlled output size"
  }]
}
```

**Expected:**
- [ ] Matches include byte and character offsets
- [ ] Pagination metadata present (`page`, `totalPages`)
- [ ] Max 5 matches per page
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps (LSP lineHint, file reading)
- [ ] **Hints Validation:**
  - [ ] Pagination hints when more results available
  - [ ] LSP tool suggestions with lineHint references
  - [ ] File reading suggestions for match context

---

### TC-3: Detailed Mode

**Goal:** Verify `mode: "detailed"` returns matches with surrounding context lines.

```json
{
  "queries": [{
    "pattern": "export function",
    "path": "<WORKSPACE_ROOT>",
    "mode": "detailed",
    "matchesPerPage": 3,
    "mainResearchGoal": "Test detailed mode functionality",
    "researchGoal": "Verify matches include surrounding context lines",
    "reasoning": "Detailed mode provides richer output for code analysis"
  }]
}
```

**Expected:**
- [ ] Matches include context lines before/after
- [ ] Richer output than paginated mode
- [ ] Pagination still works
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-4: Files Only

**Goal:** Verify `filesOnly: true` returns only file paths.

```json
{
  "queries": [{
    "pattern": "TODO",
    "path": "<WORKSPACE_ROOT>",
    "filesOnly": true,
    "mainResearchGoal": "Test files-only mode",
    "researchGoal": "Verify only file paths returned without match content",
    "reasoning": "Files-only mode enables fast file discovery for follow-up analysis"
  }]
}
```

**Expected:**
- [ ] Only file paths returned (no match content)
- [ ] No code snippets or line numbers
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps (e.g., file reading, content search)

---

### TC-5: Include Glob Filter

**Goal:** Verify `include` glob pattern limits searched files.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "include": ["*.ts"],
    "mode": "discovery",
    "mainResearchGoal": "Test include glob filter",
    "researchGoal": "Verify only TypeScript files in results",
    "reasoning": "Include filter limits search scope for targeted analysis"
  }]
}
```

**Expected:**
- [ ] Only `.ts` files in results
- [ ] May include helpful tip ("use type= instead")
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-6: Exclude Glob Filter

**Goal:** Verify `exclude` glob pattern removes files from results.

```json
{
  "queries": [{
    "pattern": "describe(",
    "path": "<WORKSPACE_ROOT>",
    "exclude": ["*.test.ts"],
    "mode": "discovery",
    "fixedString": true,
    "mainResearchGoal": "Test exclude glob filter",
    "researchGoal": "Verify test files excluded from results",
    "reasoning": "Exclude filter removes unwanted file types from search scope"
  }]
}
```

**Expected:**
- [ ] No `.test.ts` files in results
- [ ] Other file types still included
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

**Note:** `fixedString: true` required — `(` is regex special; without it ripgrep fails with "unclosed group".

---

### TC-7: Match Content Length

**Goal:** Verify `matchContentLength` controls snippet size.

```json
{
  "queries": [{
    "pattern": "export class",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchContentLength": 400,
    "matchesPerPage": 3,
    "mainResearchGoal": "Test match content length parameter",
    "researchGoal": "Verify matchContentLength controls snippet size",
    "reasoning": "Extended snippets aid in understanding match context"
  }]
}
```

**Expected:**
- [ ] Match content extended up to 400 chars (vs default 200)
- [ ] Longer snippets visible
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-8: Files Per Page

**Goal:** Verify `filesPerPage` limits number of files returned.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "filesPerPage": 3,
    "mainResearchGoal": "Test files per page pagination",
    "researchGoal": "Verify filesPerPage limits number of files returned",
    "reasoning": "Pagination controls output size for large result sets"
  }]
}
```

**Expected:**
- [ ] Max 3 files in results
- [ ] Pagination indicates more pages available
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints when more results available
  - [ ] Hints suggest actionable next steps

---

### TC-9: Case Insensitive Search

**Goal:** Verify `caseInsensitive: true` matches regardless of case.

```json
{
  "queries": [{
    "pattern": "error",
    "path": "<WORKSPACE_ROOT>",
    "caseInsensitive": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test case-insensitive search",
    "researchGoal": "Verify caseInsensitive matches regardless of case",
    "reasoning": "Case-insensitive search broadens match scope"
  }]
}
```

**Expected:**
- [ ] Matches `error`, `Error`, `ERROR`, etc.
- [ ] May include priority/precedence warning
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-10: Max Matches Per File

**Goal:** Verify `maxMatchesPerFile` caps matches within each file.

```json
{
  "queries": [{
    "pattern": "const",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "maxMatchesPerFile": 2,
    "filesPerPage": 3,
    "mainResearchGoal": "Test max matches per file limit",
    "researchGoal": "Verify maxMatchesPerFile caps matches within each file",
    "reasoning": "Per-file caps prevent single-file dominance in results"
  }]
}
```

**Expected:**
- [ ] No more than 2 matches from any single file
- [ ] Other files still included
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-11: Max Files Limit

**Goal:** Verify `maxFiles` limits total files searched.

```json
{
  "queries": [{
    "pattern": "function",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "maxFiles": 5,
    "mainResearchGoal": "Test max files limit",
    "researchGoal": "Verify maxFiles limits total files in results",
    "reasoning": "Max files cap controls result set size"
  }]
}
```

**Expected:**
- [ ] At most 5 files in results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-12: Sort by Modified

**Goal:** Verify `sort: "modified"` orders results by modification time.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "sort": "modified",
    "filesPerPage": 5,
    "mainResearchGoal": "Test sort by modified",
    "researchGoal": "Verify sort orders results by modification time",
    "reasoning": "Modified sort surfaces recently changed files first"
  }]
}
```

**Expected:**
- [ ] Most recently modified files appear first
- [ ] File order differs from default (path) sort
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-13: Line Numbers

**Goal:** Verify `lineNumbers: true` includes line/column info.

```json
{
  "queries": [{
    "pattern": "class",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "lineNumbers": true,
    "matchesPerPage": 5,
    "mainResearchGoal": "Test line numbers output",
    "researchGoal": "Verify lineNumbers includes line/column info per match",
    "reasoning": "Line numbers enable precise LSP tool targeting"
  }]
}
```

**Expected:**
- [ ] Line and column numbers present per match
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present (LSP lineHint suggestions)
  - [ ] Hints suggest actionable next steps

---

### TC-14: Fixed String (Non-regex)

**Goal:** Verify `fixedString: true` treats pattern as literal.

```json
{
  "queries": [{
    "pattern": "Array<string>",
    "path": "<WORKSPACE_ROOT>",
    "fixedString": true,
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test fixed string (non-regex) search",
    "researchGoal": "Verify fixedString treats pattern as literal",
    "reasoning": "fixedString prevents regex interpretation of special chars"
  }]
}
```

**Expected:**
- [ ] `<` and `>` treated as literal characters, not regex
- [ ] Matches exact string `Array<string>`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-15: Multiline Search

**Goal:** Verify `multiline: true` matches patterns spanning lines.

```json
{
  "queries": [{
    "pattern": "export\\s+function\\s+\\w+",
    "path": "<WORKSPACE_ROOT>",
    "multiline": true,
    "mode": "paginated",
    "matchesPerPage": 3,
    "mainResearchGoal": "Test multiline search",
    "researchGoal": "Verify multiline matches patterns spanning lines",
    "reasoning": "Multiline enables cross-line pattern matching"
  }]
}
```

**Expected:**
- [ ] Matches that span line boundaries found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-16: Whole Word Match

**Goal:** Verify `wholeWord: true` only matches whole words.

```json
{
  "queries": [{
    "pattern": "error",
    "path": "<WORKSPACE_ROOT>",
    "wholeWord": true,
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test whole word match",
    "researchGoal": "Verify wholeWord matches only complete words",
    "reasoning": "Whole word prevents partial substring matches"
  }]
}
```

**Expected:**
- [ ] Matches `error` but NOT `errorCode`, `isError`, etc.
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-17: Count + FilesOnly Conflict (Design)

**Goal:** Verify behavior when mutually exclusive params are combined.

**Design:** `filesOnly` intentionally takes precedence over `count` in the command builder. Warning is emitted.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "count": true,
    "filesOnly": true,
    "mainResearchGoal": "Test count + filesOnly conflict design",
    "researchGoal": "Verify mutually exclusive params handled gracefully",
    "reasoning": "Design validation: filesOnly takes precedence, warning emitted"
  }]
}
```

**Expected:**
- [ ] Warning about mutually exclusive params
- [ ] `count` dropped; `filesOnly` behavior takes precedence
- [ ] filesOnly output (file paths only, no match counts)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-18: Invert Match

**Goal:** Verify `invertMatch: true` returns lines NOT matching the pattern.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "invertMatch": true,
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test invert match",
    "researchGoal": "Verify invertMatch returns non-matching lines",
    "reasoning": "Invert match useful for excluding patterns"
  }]
}
```

**Expected:**
- [ ] Returned lines do NOT contain "import"
- [ ] Results are the complement of a normal search
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-19: Context Lines (Before/After)

**Goal:** Verify `beforeContext` and `afterContext` independently control surrounding lines.

```json
{
  "queries": [{
    "pattern": "export class",
    "path": "<WORKSPACE_ROOT>",
    "mode": "detailed",
    "beforeContext": 2,
    "afterContext": 10,
    "matchesPerPage": 3,
    "mainResearchGoal": "Test context lines (before/after)",
    "researchGoal": "Verify beforeContext and afterContext control surrounding lines",
    "reasoning": "Asymmetric context useful for code flow analysis"
  }]
}
```

**Expected:**
- [ ] 2 lines shown before each match
- [ ] 10 lines shown after each match
- [ ] Asymmetric context visible
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-20: File Page Navigation (Page 2)

**Goal:** Verify `filePageNumber: 2` returns different files from page 1.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "filesPerPage": 5,
    "filePageNumber": 2,
    "mainResearchGoal": "Test file page navigation",
    "researchGoal": "Verify filePageNumber 2 returns different files from page 1",
    "reasoning": "Page navigation enables browsing large result sets"
  }]
}
```

**Expected:**
- [ ] Different files than page 1
- [ ] No overlap with page 1 results
- [ ] Pagination metadata shows current page
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints for next/previous page
  - [ ] Hints suggest actionable next steps

---

### TC-21: Exclude Directory

**Goal:** Verify `excludeDir` removes entire directories from search scope.

```json
{
  "queries": [{
    "pattern": "describe(",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "excludeDir": ["tests", "node_modules"],
    "filesPerPage": 10,
    "mainResearchGoal": "Test exclude directory filter",
    "researchGoal": "Verify excludeDir removes directories from search scope",
    "reasoning": "Exclude dir narrows search to relevant source code"
  }]
}
```

**Expected:**
- [ ] No files from `tests/` or `node_modules/` directories
- [ ] Only source files in results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-22: Hidden Files Search

**Goal:** Verify `hidden: true` includes dotfiles in search results.

```json
{
  "queries": [{
    "pattern": "octocode",
    "path": "<WORKSPACE_ROOT>",
    "hidden": true,
    "mode": "discovery",
    "filesPerPage": 10,
    "mainResearchGoal": "Test hidden files search",
    "researchGoal": "Verify hidden includes dotfiles in results",
    "reasoning": "Hidden files often contain config and metadata"
  }]
}
```

**Expected:**
- [ ] Dotfiles (e.g., `.gitignore`, `.eslintrc`) included if they match
- [ ] More results than with `hidden: false` (default)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-23: File Type Filter

**Goal:** Verify `type` parameter filters by ripgrep file type (e.g., "ts" for TypeScript).

```json
{
  "queries": [{
    "pattern": "function",
    "path": "<WORKSPACE_ROOT>",
    "type": "ts",
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test file type filter",
    "researchGoal": "Verify type parameter filters by ripgrep file type",
    "reasoning": "Type filter is idiomatic for ripgrep file selection"
  }]
}
```

**Expected:**
- [ ] Only TypeScript files in results
- [ ] No `.js`, `.json`, `.md` files
- [ ] Equivalent to `include: ["*.ts"]` but more idiomatic
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-24: Count Matches

**Goal:** Verify `countMatches: true` returns per-file match counts.

```json
{
  "queries": [{
    "pattern": "const",
    "path": "<WORKSPACE_ROOT>",
    "countMatches": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test count matches",
    "researchGoal": "Verify countMatches returns per-file match counts",
    "reasoning": "Match counts aid in prioritizing file analysis"
  }]
}
```

**Expected:**
- [ ] Each file shows a numeric match count
- [ ] Counts reflect actual occurrences (not just 1 per file)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-25: Sort Reverse

**Goal:** Verify `sortReverse: true` reverses the sort order.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "sort": "path",
    "sortReverse": true,
    "filesPerPage": 5,
    "mainResearchGoal": "Test sort reverse",
    "researchGoal": "Verify sortReverse reverses sort order",
    "reasoning": "Reverse sort useful for alternate ordering"
  }]
}
```

**Expected:**
- [ ] Files sorted Z-A by path (reverse alphabetical)
- [ ] Opposite order from default `sort: "path"`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-26: Show File Last Modified

**Goal:** Verify `showFileLastModified: true` adds timestamps to results.

```json
{
  "queries": [{
    "pattern": "export function",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "showFileLastModified": true,
    "filesPerPage": 5,
    "mainResearchGoal": "Test show file last modified",
    "researchGoal": "Verify showFileLastModified adds timestamps",
    "reasoning": "Timestamps aid in recency-based analysis"
  }]
}
```

**Expected:**
- [ ] Modification timestamps visible per file
- [ ] Not shown when `showFileLastModified: false` (default)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-27: Case Sensitive Search

**Goal:** Verify `caseSensitive: true` only matches exact case.

```json
{
  "queries": [{
    "pattern": "Error",
    "path": "<WORKSPACE_ROOT>",
    "caseSensitive": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test case sensitive search",
    "researchGoal": "Verify caseSensitive only matches exact case",
    "reasoning": "Case sensitive overrides smartCase default"
  }]
}
```

**Expected:**
- [ ] Only matches `Error` (capital E)
- [ ] Does NOT match `error`, `ERROR`
- [ ] Overrides `smartCase` default
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-28: Binary Files Handling

**Goal:** Verify `binaryFiles` parameter controls binary file inclusion.

```json
{
  "queries": [{
    "pattern": "test",
    "path": "<WORKSPACE_ROOT>",
    "binaryFiles": "without-match",
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test binary files handling",
    "researchGoal": "Verify binaryFiles parameter controls binary file inclusion",
    "reasoning": "Binary file control prevents noise in search results"
  }]
}
```

**Expected:**
- [ ] Binary files excluded from results (default behavior)
- [ ] Only text files with matches shown
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-29: Non-Existent Path (Error)

**Goal:** Verify graceful error handling for invalid path.

```json
{
  "queries": [{
    "pattern": "test",
    "path": "/nonexistent/path/that/does/not/exist",
    "mainResearchGoal": "Test non-existent path error handling",
    "researchGoal": "Verify graceful error for invalid path",
    "reasoning": "Error handling prevents cascade failures"
  }]
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about invalid/missing path
- [ ] No stack trace or internal details leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with path verification suggestions
  - [ ] Hints suggest actionable recovery steps

---

### TC-30: Invalid Regex Pattern (Error)

**Goal:** Verify graceful handling of malformed regex.

```json
{
  "queries": [{
    "pattern": "[invalid(regex",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "mainResearchGoal": "Test invalid regex pattern error handling",
    "researchGoal": "Verify graceful handling of malformed regex",
    "reasoning": "Invalid regex should produce clear error, not crash"
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
  - [ ] `errorStatusHints` present with regex correction suggestions
  - [ ] Hints suggest actionable recovery steps

---

### TC-31: Empty Results

**Goal:** Verify clean handling when no files match.

```json
{
  "queries": [{
    "pattern": "COMPLETELY_UNIQUE_NONEXISTENT_STRING_XYZ_99999",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "mainResearchGoal": "Test empty results handling",
    "researchGoal": "Verify clean handling when no files match",
    "reasoning": "Empty results should not throw; hints guide recovery"
  }]
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results with `totalFiles: 0` or equivalent
- [ ] Clear indication no matches found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`empty`)
  - [ ] `emptyStatusHints` present with search refinement suggestions
  - [ ] Hints suggest broadening search, removing filters, trying parent dirs

---

### TC-32: Files Without Match

**Goal:** Verify `filesWithoutMatch: true` returns files that do NOT contain the pattern.

```json
{
  "queries": [{
    "pattern": "describe(",
    "path": "<WORKSPACE_ROOT>",
    "filesWithoutMatch": true,
    "include": ["*.ts"],
    "filesPerPage": 5,
    "mainResearchGoal": "Test files without match",
    "researchGoal": "Verify filesWithoutMatch returns non-matching files",
    "reasoning": "Inverse search finds files lacking a pattern"
  }]
}
```

**Expected:**
- [ ] Files returned do NOT contain "describe("
- [ ] Useful for finding non-test files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-33: Perl Regex (Lookahead/Lookbehind)

**Goal:** Verify `perlRegex: true` enables Perl-compatible regex features.

```json
{
  "queries": [{
    "pattern": "(?<=export )function \\w+",
    "path": "<WORKSPACE_ROOT>",
    "perlRegex": true,
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test Perl regex (lookahead/lookbehind)",
    "researchGoal": "Verify perlRegex enables PCRE features",
    "reasoning": "Perl regex enables advanced pattern matching"
  }]
}
```

**Expected:**
- [ ] Lookahead/lookbehind patterns work
- [ ] Matches only "function X" when preceded by "export "
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps (LSP, file reading)

---

### TC-34: No Ignore (.gitignore bypass)

**Goal:** Verify `noIgnore: true` searches through .gitignore'd files.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "noIgnore": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test no ignore (.gitignore bypass)",
    "researchGoal": "Verify noIgnore searches through gitignore'd files",
    "reasoning": "NoIgnore useful for build artifacts and generated code"
  }]
}
```

**Expected:**
- [ ] Files normally excluded by .gitignore (e.g., dist/, coverage/) appear in results
- [ ] More results than default
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-35: Follow Symlinks

**Goal:** Verify `followSymlinks: true` resolves symbolic links during search.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "followSymlinks": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test follow symlinks",
    "researchGoal": "Verify followSymlinks resolves symbolic links",
    "reasoning": "Symlink following enables monorepo and linked package search"
  }]
}
```

**Expected:**
- [ ] Symlinked files/directories included in search
- [ ] No error on symlink traversal
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-36: Context Lines (Symmetric)

**Goal:** Verify `contextLines` provides symmetric context around matches (unlike beforeContext/afterContext).

```json
{
  "queries": [{
    "pattern": "export class",
    "path": "<WORKSPACE_ROOT>",
    "mode": "detailed",
    "contextLines": 5,
    "matchesPerPage": 3,
    "mainResearchGoal": "Test context lines (symmetric)",
    "researchGoal": "Verify contextLines provides symmetric context",
    "reasoning": "Symmetric context aids balanced code analysis"
  }]
}
```

**Expected:**
- [ ] 5 lines before AND 5 lines after each match
- [ ] Symmetric context visible
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-37: Column Offset Reporting

**Goal:** Verify `column: true` includes column position in match output.

```json
{
  "queries": [{
    "pattern": "export function",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "column": true,
    "matchesPerPage": 5,
    "mainResearchGoal": "Test column offset reporting",
    "researchGoal": "Verify column includes character position per match",
    "reasoning": "Column info enables precise cursor positioning"
  }]
}
```

**Expected:**
- [ ] Column position present per match
- [ ] Indicates character offset within line
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present (LSP lineHint)
  - [ ] Hints suggest actionable next steps

---

### TC-38: Multiline + Dotall Combined

**Goal:** Verify `multiline: true` + `multilineDotall: true` enables dot-matches-newline.

```json
{
  "queries": [{
    "pattern": "export.*\\{",
    "path": "<WORKSPACE_ROOT>",
    "multiline": true,
    "multilineDotall": true,
    "mode": "paginated",
    "matchesPerPage": 3,
    "mainResearchGoal": "Test multiline + dotall combined",
    "researchGoal": "Verify multilineDotall enables dot-matches-newline",
    "reasoning": "Dotall extends multiline for cross-line patterns"
  }]
}
```

**Expected:**
- [ ] Dot (.) matches newline characters
- [ ] Patterns span across line boundaries
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-39: Include Stats Toggle

**Goal:** Verify `includeStats: false` omits statistics from output.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "includeStats": false,
    "filesPerPage": 5,
    "mainResearchGoal": "Test include stats toggle",
    "researchGoal": "Verify includeStats: false omits statistics",
    "reasoning": "Stats toggle controls output verbosity"
  }]
}
```

**Expected:**
- [ ] No distribution/stats metadata in output
- [ ] Differs from default (includeStats: true)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-40: Include Distribution Toggle

**Goal:** Verify `includeDistribution: false` omits file distribution data.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "includeDistribution": false,
    "filesPerPage": 5,
    "mainResearchGoal": "Test include distribution toggle",
    "researchGoal": "Verify includeDistribution: false omits distribution data",
    "reasoning": "Distribution toggle reduces output size"
  }]
}
```

**Expected:**
- [ ] No distribution breakdown in output
- [ ] Differs from default (includeDistribution: true)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-41: Line Regexp (Full Line Match)

**Goal:** Verify `lineRegexp: true` matches only entire lines.

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "lineRegexp": true,
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test line regexp (full line match)",
    "researchGoal": "Verify lineRegexp matches only entire lines",
    "reasoning": "Line regexp prevents partial line matches"
  }]
}
```

**Expected:**
- [ ] Only lines that ARE exactly "import" (nothing else)
- [ ] Not lines containing "import"
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-42: Smart Case (Default Behavior)

**Goal:** Verify `smartCase: true` (default) — lowercase = insensitive, uppercase = sensitive.

```json
{
  "queries": [{
    "pattern": "error",
    "path": "<WORKSPACE_ROOT>",
    "smartCase": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test smart case (default behavior)",
    "researchGoal": "Verify smartCase: lowercase=insensitive, uppercase=sensitive",
    "reasoning": "Smart case balances flexibility and precision"
  }]
}
```

**Expected:**
- [ ] Matches "error", "Error", "ERROR" (all-lowercase pattern = case-insensitive)
- [ ] With "Error" as pattern, only exact case matched
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-43: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting a page that doesn't exist.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
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
- [ ] Pagination metadata reflects actual total
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints indicate boundary
  - [ ] Hints suggest actionable next steps

---

### TC-44: Pattern Max Length (Boundary)

**Goal:** Verify behavior with pattern at maximum length (2000 chars).

```json
{
  "queries": [{
    "pattern": "<2000_char_string>",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "mainResearchGoal": "Test pattern max length (boundary)",
    "researchGoal": "Verify behavior with pattern at maximum length",
    "reasoning": "Boundary test ensures pattern length limits handled"
  }]
}
```

**Expected:**
- [ ] No crash or timeout
- [ ] Empty results expected (no match)
- [ ] Handles gracefully
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-45: Count Lines (Standalone)

**Goal:** Verify `count: true` returns per-file line counts (without `filesOnly` conflict).

```json
{
  "queries": [{
    "pattern": "import",
    "path": "<WORKSPACE_ROOT>",
    "count": true,
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test count lines (standalone)",
    "researchGoal": "Verify count returns per-file line counts",
    "reasoning": "Count mode provides aggregate without content"
  }]
}
```

**Expected:**
- [ ] Each file shows a line count (number of matching lines)
- [ ] No match content or code snippets
- [ ] Distinct from `countMatches` (counts lines, not individual matches)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-46: Sort by Accessed Time

**Goal:** Verify `sort: "accessed"` orders results by last access time.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "sort": "accessed",
    "filesPerPage": 5,
    "mainResearchGoal": "Test sort by accessed time",
    "researchGoal": "Verify sort: accessed orders by last access time",
    "reasoning": "Accessed sort surfaces recently used files"
  }]
}
```

**Expected:**
- [ ] Most recently accessed files appear first
- [ ] File order differs from default (path) sort
- [ ] Order may differ from `sort: "modified"`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-47: Sort by Created Time

**Goal:** Verify `sort: "created"` orders results by file creation time.

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>",
    "mode": "discovery",
    "sort": "created",
    "filesPerPage": 5,
    "mainResearchGoal": "Test sort by created time",
    "researchGoal": "Verify sort: created orders by file creation time",
    "reasoning": "Created sort surfaces newest files"
  }]
}
```

**Expected:**
- [ ] Most recently created files appear first
- [ ] File order differs from default (path) sort
- [ ] Order may differ from `sort: "modified"` and `sort: "accessed"`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-48: Bulk Queries (Mixed Valid + Invalid)

**Goal:** Verify error isolation in bulk queries — one failure doesn't affect others.

```json
{
  "queries": [
    {
      "pattern": "export",
      "path": "<WORKSPACE_ROOT>",
      "mode": "discovery",
      "filesPerPage": 3,
      "mainResearchGoal": "Test bulk queries error isolation",
      "researchGoal": "Verify valid query succeeds when others fail",
      "reasoning": "Bulk queries must isolate errors per query"
    },
    {
      "pattern": "[invalid(regex",
      "path": "<WORKSPACE_ROOT>",
      "mode": "discovery",
      "mainResearchGoal": "Test bulk queries error isolation",
      "researchGoal": "Verify invalid regex returns error without affecting others",
      "reasoning": "Error isolation prevents cascade failure"
    },
    {
      "pattern": "import",
      "path": "/nonexistent/path",
      "mainResearchGoal": "Test bulk queries error isolation",
      "researchGoal": "Verify invalid path returns error without affecting others",
      "reasoning": "Each query result must be independent"
    }
  ]
}
```

**Expected:**
- [ ] First query succeeds
- [ ] Second and third return errors
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array has per-query `status` (hasResults, error, error)
  - [ ] Status-specific hints for each result type
  - [ ] Hints suggest actionable next steps per query

---

### TC-49: Encoding Parameter

**Goal:** Verify `encoding` parameter for non-UTF8 file search.

```json
{
  "queries": [{
    "pattern": "test",
    "path": "<WORKSPACE_ROOT>",
    "encoding": "utf-8",
    "mode": "discovery",
    "filesPerPage": 5,
    "mainResearchGoal": "Test encoding parameter",
    "researchGoal": "Verify encoding for non-UTF8 file search",
    "reasoning": "Encoding parameter handles alternate character sets"
  }]
}
```

**Expected:**
- [ ] Search completes with specified encoding
- [ ] No encoding errors
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-50: No Unicode

**Goal:** Verify `noUnicode: true` disables Unicode-aware matching.

```json
{
  "queries": [{
    "pattern": "\\w+",
    "path": "<WORKSPACE_ROOT>",
    "noUnicode": true,
    "mode": "paginated",
    "matchesPerPage": 5,
    "mainResearchGoal": "Test no unicode parameter",
    "researchGoal": "Verify noUnicode disables Unicode-aware matching",
    "reasoning": "NoUnicode useful for ASCII-only pattern matching"
  }]
}
```

**Expected:**
- [ ] \w only matches ASCII word chars (not Unicode letters)
- [ ] May differ from default (Unicode-aware)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-51: Passthru Mode

**Goal:** Verify `passthru: true` outputs every line (non-matching lines included).

```json
{
  "queries": [{
    "pattern": "export",
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "passthru": true,
    "mode": "paginated",
    "matchesPerPage": 20,
    "mainResearchGoal": "Test passthru mode",
    "researchGoal": "Verify passthru outputs every line with highlights",
    "reasoning": "Passthru shows full file context with match highlighting"
  }]
}
```

**Expected:**
- [ ] Both matching and non-matching lines in output
- [ ] Effectively shows full file with highlights
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Pagination tests** verify `matchesPerPage`, `filesPerPage`, `filePageNumber`
- [ ] **Hints validation** checks for helpful guidance in all responses

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Discovery mode | ✅ | - | ✅ | |
| 2 | Paginated mode | ✅ | ✅ | ✅ | |
| 3 | Detailed mode | ✅ | ✅ | ✅ | |
| 4 | Files only | ✅ | - | ✅ | |
| 5 | Include glob | ✅ | - | ✅ | |
| 6 | Exclude glob | ✅ | - | ✅ | |
| 7 | Match content length | ✅ | ✅ | ✅ | |
| 8 | Files per page | ✅ | ✅ | ✅ | |
| 9 | Case insensitive | ✅ | ✅ | ✅ | |
| 10 | Max matches per file | ✅ | ✅ | ✅ | |
| 11 | Max files | ✅ | - | ✅ | |
| 12 | Sort by modified | ✅ | ✅ | ✅ | |
| 13 | Line numbers | ✅ | ✅ | ✅ | |
| 14 | Fixed string | ✅ | ✅ | ✅ | |
| 15 | Multiline | ✅ | ✅ | ✅ | |
| 16 | Whole word | ✅ | ✅ | ✅ | |
| 17 | Count + filesOnly conflict | ✅ | - | ✅ | |
| 18 | Invert match | ✅ | ✅ | ✅ | |
| 19 | Context lines (before/after) | ✅ | ✅ | ✅ | |
| 20 | File page navigation | ✅ | ✅ | ✅ | |
| 21 | Exclude directory | ✅ | ✅ | ✅ | |
| 22 | Hidden files search | ✅ | ✅ | ✅ | |
| 23 | File type filter | ✅ | ✅ | ✅ | |
| 24 | Count matches | ✅ | ✅ | ✅ | |
| 25 | Sort reverse | ✅ | ✅ | ✅ | |
| 26 | Show file last modified | ✅ | ✅ | ✅ | |
| 27 | Case sensitive | ✅ | ✅ | ✅ | |
| 28 | Binary files handling | ✅ | ✅ | ✅ | |
| 29 | Non-existent path (error) | ✅ | - | ✅ | |
| 30 | Invalid regex (error) | ✅ | - | ✅ | |
| 31 | Empty results | ✅ | - | ✅ | |
| 32 | Files without match | ✅ | ✅ | ✅ | |
| 33 | Perl regex (lookahead/lookbehind) | ✅ | ✅ | ✅ | |
| 34 | No ignore (.gitignore bypass) | ✅ | ✅ | ✅ | |
| 35 | Follow symlinks | ✅ | ✅ | ✅ | |
| 36 | Context lines (symmetric) | ✅ | ✅ | ✅ | |
| 37 | Column offset reporting | ✅ | ✅ | ✅ | |
| 38 | Multiline + dotall combined | ✅ | ✅ | ✅ | |
| 39 | Include stats toggle | ✅ | ✅ | ✅ | |
| 40 | Include distribution toggle | ✅ | ✅ | ✅ | |
| 41 | Line regexp (full line match) | ✅ | ✅ | ✅ | |
| 42 | Smart case (default behavior) | ✅ | ✅ | ✅ | |
| 43 | Page beyond available (boundary) | ✅ | ✅ | ✅ | |
| 44 | Pattern max length (boundary) | ✅ | - | ✅ | |
| 45 | Count lines (standalone) | ✅ | ✅ | ✅ | |
| 46 | Sort by accessed time | ✅ | ✅ | ✅ | |
| 47 | Sort by created time | ✅ | ✅ | ✅ | |
| 48 | Bulk queries (mixed valid + invalid) | ✅ | ✅ | ✅ | |
| 49 | Encoding parameter | ✅ | ✅ | ✅ | |
| 50 | No unicode | ✅ | ✅ | ✅ | |
| 51 | Passthru mode | ✅ | ✅ | ✅ | |

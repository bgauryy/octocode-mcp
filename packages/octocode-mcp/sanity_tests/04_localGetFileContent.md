# Sanity Test: `localGetFileContent`

---

## Tool Overview

Reads file content from local filesystem with multiple extraction modes: line range, match string (with context), full content, and character offset/length pagination. The highest-rated tool in the suite.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `charOffset`, `charLength` parameters for content pagination
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/path/to/file.ts",
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this content extraction",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters (startLine, endLine, matchString, etc.)
  }]
}
```

### Hints Validation Checklist
- [ ] Response includes helpful hints for content analysis
- [ ] Hints suggest next logical steps (e.g., line range expansion, match refinement)
- [ ] Pagination hints when content is truncated (charOffset/charLength)
- [ ] Match range hints when using matchString

---

## Test Cases

### TC-1: Line Range Extraction

**Goal:** Verify `startLine` + `endLine` returns exact line range.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "startLine": 1,
    "endLine": 20,
    "mainResearchGoal": "Test line range extraction",
    "researchGoal": "Verify startLine + endLine returns exact range",
    "reasoning": "Line range enables targeted content extraction"
  }]
}
```

**Expected:**
- [ ] Lines 1 through 20 returned
- [ ] `totalLines` metadata present
- [ ] Content matches actual file
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content and metadata
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps (expand range, match string)

---

### TC-2: Match String with Context

**Goal:** Verify `matchString` + `matchStringContextLines` finds target and returns surrounding context.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "registerTool",
    "matchStringContextLines": 10,
    "mainResearchGoal": "Test match string with context",
    "researchGoal": "Verify matchString finds target with surrounding context",
    "reasoning": "Match string enables targeted extraction with context"
  }]
}
```

**Expected:**
- [ ] Match found at correct location
- [ ] 10 lines of context before and after
- [ ] `matchRanges` metadata shows where matches were found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content and matchRanges
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-3: Full Content

**Goal:** Verify `fullContent: true` returns the complete file.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/package.json",
    "fullContent": true,
    "mainResearchGoal": "Test full content extraction",
    "researchGoal": "Verify fullContent returns complete file",
    "reasoning": "Full content for small file analysis"
  }]
}
```

**Expected:**
- [ ] Entire file content returned
- [ ] `isPartial: false`
- [ ] `totalLines` matches actual line count
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-4: Character Offset + Length

**Goal:** Verify `charOffset` + `charLength` for character-based extraction.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "charOffset": 0,
    "charLength": 500,
    "mainResearchGoal": "Test character offset + length pagination",
    "researchGoal": "Verify charOffset + charLength for character-based extraction",
    "reasoning": "Char pagination enables large file navigation"
  }]
}
```

**Expected:**
- [ ] First 500 characters of file returned
- [ ] Pagination info present ("page 1 of N, next: charOffset=500")
- [ ] `isPartial: true` if file is larger than 500 chars
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Pagination hints for next charOffset
  - [ ] Hints suggest actionable next steps

---

### TC-5: Regex Match String

**Goal:** Verify `matchStringIsRegex: true` enables regex in match string.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/tools/toolMetadata/lspSchemaHelpers.ts",
    "matchString": "isToolError|toToolError",
    "matchStringIsRegex": true,
    "matchStringContextLines": 5,
    "mainResearchGoal": "Test regex match string",
    "researchGoal": "Verify matchStringIsRegex enables regex matching",
    "reasoning": "Regex enables multi-pattern matching"
  }]
}
```

**Expected:**
- [ ] Both `isToolError` and `toToolError` matched
- [ ] Multiple `matchRanges` entries
- [ ] Context lines around each match
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with matchRanges
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-6: Case-Sensitive Match

**Goal:** Verify `matchStringCaseSensitive: true` only matches exact case.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "Server",
    "matchStringCaseSensitive": true,
    "matchStringContextLines": 3,
    "mainResearchGoal": "Test case-sensitive match",
    "researchGoal": "Verify matchStringCaseSensitive matches exact case only",
    "reasoning": "Case sensitive for precise symbol matching"
  }]
}
```

**Expected:**
- [ ] Only matches `Server` (capital S)
- [ ] Does NOT match `server` (lowercase)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-7: Character Offset Pagination (Page 2)

**Goal:** Verify navigating to page 2 via `charOffset`.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "charOffset": 500,
    "charLength": 500,
    "mainResearchGoal": "Test charOffset pagination (page 2)",
    "researchGoal": "Verify navigating to page 2 via charOffset",
    "reasoning": "CharOffset pagination enables content navigation"
  }]
}
```

**Expected:**
- [ ] Characters 500-999 returned
- [ ] Content does not overlap with TC-4 (charOffset=0)
- [ ] Pagination indicates current page and next offset
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Pagination hints for next/previous charOffset
  - [ ] Hints suggest actionable next steps

---

### TC-8: Empty Match String

**Goal:** Verify behavior when `matchString` finds no matches.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "NONEXISTENT_STRING_XYZ_12345",
    "matchStringContextLines": 5,
    "mainResearchGoal": "Test empty match string",
    "researchGoal": "Verify behavior when matchString finds no matches",
    "reasoning": "Empty match should not throw; hints guide recovery"
  }]
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty or no match results
- [ ] Clear indication that no matches found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`empty`)
  - [ ] `emptyStatusHints` present with match refinement suggestions
  - [ ] Hints suggest actionable next steps (try different string, use line range)

---

### TC-9: Large Context Lines

**Goal:** Verify large `matchStringContextLines` values work.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "export",
    "matchStringContextLines": 50,
    "mainResearchGoal": "Test large context lines",
    "researchGoal": "Verify large matchStringContextLines values work",
    "reasoning": "Large context aids comprehensive analysis"
  }]
}
```

**Expected:**
- [ ] Up to 50 lines context before and after
- [ ] Does not exceed file boundaries
- [ ] Content is coherent
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-10: Non-Existent File (Error)

**Goal:** Verify graceful error when file does not exist.

```json
{
  "queries": [{
    "path": "/nonexistent/path/to/file.ts",
    "mainResearchGoal": "Test non-existent file error",
    "researchGoal": "Verify graceful error when file does not exist",
    "reasoning": "Error handling prevents cascade failures"
  }]
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about missing file
- [ ] No stack trace or internal details leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with path verification suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-11: startLine Greater Than endLine (Validation Error)

**Goal:** Verify validation rejects `startLine > endLine`.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "startLine": 50,
    "endLine": 10,
    "mainResearchGoal": "Test startLine > endLine validation",
    "researchGoal": "Verify validation rejects invalid line range",
    "reasoning": "Validation prevents invalid extraction"
  }]
}
```

**Expected:**
- [ ] Validation error message
- [ ] Clear indication that startLine must be <= endLine
- [ ] No partial content returned
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with range correction suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-12: fullContent + matchString Conflict (Validation Error)

**Goal:** Verify mutually exclusive parameters are rejected.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "fullContent": true,
    "matchString": "export",
    "mainResearchGoal": "Test fullContent + matchString conflict",
    "researchGoal": "Verify mutually exclusive params rejected",
    "reasoning": "Validation prevents conflicting extraction modes"
  }]
}
```

**Expected:**
- [ ] Validation error about mutually exclusive parameters
- [ ] Clear indication which params conflict
- [ ] No content returned
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with param correction suggestions
  - [ ] Hints suggest actionable next steps

---

### TC-13: Binary File Handling

**Goal:** Verify behavior when reading a binary/image file.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/dist/index.mjs",
    "startLine": 1,
    "endLine": 5,
    "mainResearchGoal": "Test binary file handling",
    "researchGoal": "Verify behavior when reading binary/minified content",
    "reasoning": "Graceful handling of non-text content"
  }]
}
```

**Expected:**
- [ ] Either minified content or appropriate error
- [ ] No crash on non-text content
- [ ] Graceful handling
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-14: startLine + endLine Only (No matchString, No fullContent)

**Goal:** Verify line range works as standalone extraction without other modes.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "startLine": 10,
    "endLine": 10,
    "mainResearchGoal": "Test single line extraction",
    "researchGoal": "Verify line range works as standalone extraction",
    "reasoning": "Single line extraction for minimal output"
  }]
}
```

**Expected:**
- [ ] Exactly 1 line returned (line 10)
- [ ] Content matches actual file line 10
- [ ] Minimal output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-15: Match String Context Lines Minimum (Boundary)

**Goal:** Verify `matchStringContextLines: 1` returns minimal context.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "export",
    "matchStringContextLines": 1,
    "mainResearchGoal": "Test match string context lines minimum (boundary)",
    "researchGoal": "Verify matchStringContextLines 1 returns minimal context",
    "reasoning": "Boundary test for minimal context"
  }]
}
```

**Expected:**
- [ ] Only 1 line of context before and after each match
- [ ] Minimal but useful context
- [ ] Much less output than default (5 lines)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-16: Match String Max Length (Boundary)

**Goal:** Verify `matchString` at maximum length (2000 chars) is handled.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "<2000_char_string>",
    "matchStringContextLines": 5,
    "mainResearchGoal": "Test match string max length (boundary)",
    "researchGoal": "Verify matchString at max length handled",
    "reasoning": "Boundary test for pattern length"
  }]
}
```

**Expected:**
- [ ] No crash or timeout
- [ ] Empty results expected (no match for very long string)
- [ ] Handles gracefully
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-17: CharOffset Near End of File

**Goal:** Verify `charOffset` near end of file returns remaining content.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "charOffset": 99999,
    "charLength": 500,
    "mainResearchGoal": "Test charOffset near end of file",
    "researchGoal": "Verify charOffset near end returns remaining content",
    "reasoning": "Boundary test for char pagination"
  }]
}
```

**Expected:**
- [ ] Returns remaining content (less than 500 chars)
- [ ] Or empty if offset beyond file size
- [ ] No error thrown
- [ ] `isPartial` reflects actual state
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Pagination hints reflect boundary
  - [ ] Hints suggest actionable next steps

---

### TC-18: CharLength Exceeding File Size

**Goal:** Verify `charLength` larger than file returns full content.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/package.json",
    "charOffset": 0,
    "charLength": 10000,
    "mainResearchGoal": "Test charLength exceeding file size",
    "researchGoal": "Verify charLength larger than file returns full content",
    "reasoning": "Oversized charLength should return full file"
  }]
}
```

**Expected:**
- [ ] Full file content returned (file smaller than 10000 chars)
- [ ] No error thrown
- [ ] `isPartial: false` or equivalent
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-19: Directory Path Instead of File (Error)

**Goal:** Verify graceful error when given a directory instead of file.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src",
    "mainResearchGoal": "Test directory path error",
    "researchGoal": "Verify graceful error when given directory instead of file",
    "reasoning": "Error handling for wrong path type"
  }]
}
```

**Expected:**
- [ ] Error message about path being a directory, not a file
- [ ] No crash
- [ ] Clear, actionable error message
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`error`)
  - [ ] `errorStatusHints` present with path type suggestions
  - [ ] Hints suggest actionable next steps (use localViewStructure for dirs)

---

### TC-20: Multiple Matches in Match String

**Goal:** Verify `matchString` finds and reports multiple occurrences.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "import",
    "matchStringContextLines": 2,
    "mainResearchGoal": "Test multiple matches in match string",
    "researchGoal": "Verify matchString finds and reports multiple occurrences",
    "reasoning": "Multi-match enables comprehensive pattern analysis"
  }]
}
```

**Expected:**
- [ ] Multiple `matchRanges` entries (one per occurrence)
- [ ] Each match has its own context window
- [ ] All occurrences found in file
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with matchRanges
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-21: Match String Context Lines Maximum (Boundary)

**Goal:** Verify `matchStringContextLines: 50` (maximum) works correctly.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "matchString": "Server",
    "matchStringContextLines": 50,
    "mainResearchGoal": "Test match string context lines maximum (boundary)",
    "researchGoal": "Verify matchStringContextLines 50 works correctly",
    "reasoning": "Boundary test for max context"
  }]
}
```

**Expected:**
- [ ] Up to 50 lines of context before and after
- [ ] Does not exceed file boundaries
- [ ] No error at maximum value
- [ ] Large but manageable output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-22: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts", "startLine": 1, "endLine": 5, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify valid query succeeds", "reasoning": "Bulk must isolate errors"},
    {"path": "/nonexistent/file.ts", "fullContent": true, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify invalid path returns error", "reasoning": "Error must not affect others"},
    {"path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts", "matchString": "export", "matchStringContextLines": 3, "mainResearchGoal": "Test bulk error isolation", "researchGoal": "Verify valid query succeeds", "reasoning": "Each result independent"}
  ]
}
```

**Expected:**
- [ ] First and third queries succeed
- [ ] Second query returns error (file not found)
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array has per-query `status` (hasResults, error, hasResults)
  - [ ] Status-specific hints for each result type
  - [ ] Hints suggest actionable next steps per query

---

### TC-23: startLine = endLine = 1 (First Line Only)

**Goal:** Verify extracting only the very first line of a file.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "startLine": 1,
    "endLine": 1,
    "mainResearchGoal": "Test first line only extraction",
    "researchGoal": "Verify extracting only first line",
    "reasoning": "Single line extraction for file header"
  }]
}
```

**Expected:**
- [ ] Exactly 1 line returned (first line of file)
- [ ] Content is the file's first line
- [ ] Minimal output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-24: endLine Beyond File Length

**Goal:** Verify behavior when `endLine` exceeds total file lines.

```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "startLine": 1,
    "endLine": 99999,
    "mainResearchGoal": "Test endLine beyond file length",
    "researchGoal": "Verify behavior when endLine exceeds file length",
    "reasoning": "Boundary test for line range"
  }]
}
```

**Expected:**
- [ ] Returns all lines from startLine to end of file
- [ ] No error thrown
- [ ] `totalLines` shows actual file length
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with content
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps

---

### TC-25: CharOffset + CharLength Pagination Test

**Goal:** Test `charOffset` + `charLength` pagination; verify navigating content with offsets.

**Page 1 (charOffset=0):**
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "charOffset": 0,
    "charLength": 300,
    "mainResearchGoal": "Test charOffset/charLength pagination",
    "researchGoal": "Verify page 1 returns first 300 chars",
    "reasoning": "Char pagination enables large file navigation"
  }]
}
```

**Page 2 (charOffset=300):**
```json
{
  "queries": [{
    "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
    "charOffset": 300,
    "charLength": 300,
    "mainResearchGoal": "Test charOffset pagination navigation",
    "researchGoal": "Verify charOffset 300 returns next 300 chars",
    "reasoning": "Offset navigation must not overlap with previous page"
  }]
}
```

**Expected:**
- [ ] Page 1 returns chars 0-299
- [ ] Page 2 returns chars 300-599 (different content, no overlap)
- [ ] Pagination hints indicate next charOffset
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] Pagination hints for next/previous charOffset
  - [ ] Hints suggest actionable next steps

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Pagination tests** verify `charOffset`, `charLength` parameters
- [ ] **Hints validation** checks for helpful guidance in all responses

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Line range | | | | |
| 2 | Match string + context | | | | |
| 3 | Full content | | | | |
| 4 | Char offset + length | | | | |
| 5 | Regex match string | | | | |
| 6 | Case-sensitive match | | | | |
| 7 | Char offset page 2 | | | | |
| 8 | Empty match string | | | | |
| 9 | Large context lines | | | | |
| 10 | Non-existent file (error) | | | | |
| 11 | startLine > endLine (validation) | | | | |
| 12 | fullContent + matchString conflict | | | | |
| 13 | Binary file handling | | | | |
| 14 | Single line extraction | | | | |
| 15 | Match string context lines minimum (boundary) | | | | |
| 16 | Match string max length (boundary) | | | | |
| 17 | CharOffset near end of file | | | | |
| 18 | CharLength exceeding file size | | | | |
| 19 | Directory path instead of file (error) | | | | |
| 20 | Multiple matches in match string | | | | |
| 21 | Match string context lines maximum (boundary) | | | | |
| 22 | Bulk queries (error isolation) | | | | |
| 23 | startLine = endLine = 1 (first line only) | | | | |
| 24 | endLine beyond file length | | | | |
| 25 | CharOffset + CharLength pagination | | | | |

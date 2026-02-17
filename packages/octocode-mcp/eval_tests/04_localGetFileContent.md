# Eval Test: `localGetFileContent`

> **Rating: 10/10** | Category: Local | Last tested: Feb 17, 2026

---

## Tool Overview

Reads file content from local filesystem with multiple extraction modes: line range, match string (with context), full content, and character offset/length pagination. The highest-rated tool in the suite.

---

## Test Cases

### TC-1: Line Range Extraction

**Goal:** Verify `startLine` + `endLine` returns exact line range.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "startLine": 1,
  "endLine": 20
}
```

**Expected:**
- [ ] Lines 1 through 20 returned
- [ ] `totalLines` metadata present
- [ ] Content matches actual file

---

### TC-2: Match String with Context

**Goal:** Verify `matchString` + `matchStringContextLines` finds target and returns surrounding context.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "registerTool",
  "matchStringContextLines": 10
}
```

**Expected:**
- [ ] Match found at correct location
- [ ] 10 lines of context before and after
- [ ] `matchRanges` metadata shows where matches were found

---

### TC-3: Full Content

**Goal:** Verify `fullContent: true` returns the complete file.

```json
{
  "path": "<WORKSPACE_ROOT>/package.json",
  "fullContent": true
}
```

**Expected:**
- [ ] Entire file content returned
- [ ] `isPartial: false`
- [ ] `totalLines` matches actual line count

---

### TC-4: Character Offset + Length

**Goal:** Verify `charOffset` + `charLength` for character-based extraction.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "charOffset": 0,
  "charLength": 500
}
```

**Expected:**
- [ ] First 500 characters of file returned
- [ ] Pagination info present ("page 1 of N, next: charOffset=500")
- [ ] `isPartial: true` if file is larger than 500 chars

---

### TC-5: Regex Match String

**Goal:** Verify `matchStringIsRegex: true` enables regex in match string.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/tools/toolMetadata/lspSchemaHelpers.ts",
  "matchString": "isToolError|toToolError",
  "matchStringIsRegex": true,
  "matchStringContextLines": 5
}
```

**Expected:**
- [ ] Both `isToolError` and `toToolError` matched
- [ ] Multiple `matchRanges` entries
- [ ] Context lines around each match

---

### TC-6: Case-Sensitive Match

**Goal:** Verify `matchStringCaseSensitive: true` only matches exact case.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "Server",
  "matchStringCaseSensitive": true,
  "matchStringContextLines": 3
}
```

**Expected:**
- [ ] Only matches `Server` (capital S)
- [ ] Does NOT match `server` (lowercase)

---

### TC-7: Character Offset Pagination (Page 2)

**Goal:** Verify navigating to page 2 via `charOffset`.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "charOffset": 500,
  "charLength": 500
}
```

**Expected:**
- [ ] Characters 500-999 returned
- [ ] Content does not overlap with TC-4 (charOffset=0)
- [ ] Pagination indicates current page and next offset

---

### TC-8: Empty Match String

**Goal:** Verify behavior when `matchString` finds no matches.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "NONEXISTENT_STRING_XYZ_12345",
  "matchStringContextLines": 5
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty or no match results
- [ ] Clear indication that no matches found

---

### TC-9: Large Context Lines

**Goal:** Verify large `matchStringContextLines` values work.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "export",
  "matchStringContextLines": 50
}
```

**Expected:**
- [ ] Up to 50 lines context before and after
- [ ] Does not exceed file boundaries
- [ ] Content is coherent

---

### TC-10: Non-Existent File (Error)

**Goal:** Verify graceful error when file does not exist.

```json
{
  "path": "/nonexistent/path/to/file.ts"
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Descriptive error about missing file
- [ ] No stack trace or internal details leaked

---

### TC-11: startLine Greater Than endLine (Validation Error)

**Goal:** Verify validation rejects `startLine > endLine`.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "startLine": 50,
  "endLine": 10
}
```

**Expected:**
- [ ] Validation error message
- [ ] Clear indication that startLine must be <= endLine
- [ ] No partial content returned

---

### TC-12: fullContent + matchString Conflict (Validation Error)

**Goal:** Verify mutually exclusive parameters are rejected.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "fullContent": true,
  "matchString": "export"
}
```

**Expected:**
- [ ] Validation error about mutually exclusive parameters
- [ ] Clear indication which params conflict
- [ ] No content returned

---

### TC-13: Binary File Handling

**Goal:** Verify behavior when reading a binary/image file.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/dist/index.mjs",
  "startLine": 1,
  "endLine": 5
}
```

**Expected:**
- [ ] Either minified content or appropriate error
- [ ] No crash on non-text content
- [ ] Graceful handling

---

### TC-14: startLine + endLine Only (No matchString, No fullContent)

**Goal:** Verify line range works as standalone extraction without other modes.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "startLine": 10,
  "endLine": 10
}
```

**Expected:**
- [ ] Exactly 1 line returned (line 10)
- [ ] Content matches actual file line 10
- [ ] Minimal output

---

### TC-15: Match String Context Lines Minimum (Boundary)

**Goal:** Verify `matchStringContextLines: 1` returns minimal context.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "export",
  "matchStringContextLines": 1
}
```

**Expected:**
- [ ] Only 1 line of context before and after each match
- [ ] Minimal but useful context
- [ ] Much less output than default (5 lines)

---

### TC-16: Match String Max Length (Boundary)

**Goal:** Verify `matchString` at maximum length (2000 chars) is handled.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "<2000_char_string>",
  "matchStringContextLines": 5
}
```

**Expected:**
- [ ] No crash or timeout
- [ ] Empty results expected (no match for very long string)
- [ ] Handles gracefully

---

### TC-17: CharOffset Near End of File

**Goal:** Verify `charOffset` near end of file returns remaining content.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "charOffset": 99999,
  "charLength": 500
}
```

**Expected:**
- [ ] Returns remaining content (less than 500 chars)
- [ ] Or empty if offset beyond file size
- [ ] No error thrown
- [ ] `isPartial` reflects actual state

---

### TC-18: CharLength Exceeding File Size

**Goal:** Verify `charLength` larger than file returns full content.

```json
{
  "path": "<WORKSPACE_ROOT>/package.json",
  "charOffset": 0,
  "charLength": 10000
}
```

**Expected:**
- [ ] Full file content returned (file smaller than 10000 chars)
- [ ] No error thrown
- [ ] `isPartial: false` or equivalent

---

### TC-19: Directory Path Instead of File (Error)

**Goal:** Verify graceful error when given a directory instead of file.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src"
}
```

**Expected:**
- [ ] Error message about path being a directory, not a file
- [ ] No crash
- [ ] Clear, actionable error message

---

### TC-20: Multiple Matches in Match String

**Goal:** Verify `matchString` finds and reports multiple occurrences.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "import",
  "matchStringContextLines": 2
}
```

**Expected:**
- [ ] Multiple `matchRanges` entries (one per occurrence)
- [ ] Each match has its own context window
- [ ] All occurrences found in file

---

### TC-21: Match String Context Lines Maximum (Boundary)

**Goal:** Verify `matchStringContextLines: 50` (maximum) works correctly.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "matchString": "Server",
  "matchStringContextLines": 50
}
```

**Expected:**
- [ ] Up to 50 lines of context before and after
- [ ] Does not exceed file boundaries
- [ ] No error at maximum value
- [ ] Large but manageable output

---

### TC-22: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts", "startLine": 1, "endLine": 5},
    {"path": "/nonexistent/file.ts", "fullContent": true},
    {"path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts", "matchString": "export", "matchStringContextLines": 3}
  ]
}
```

**Expected:**
- [ ] First and third queries succeed
- [ ] Second query returns error (file not found)
- [ ] Each result isolated per query
- [ ] No cascade failure

---

### TC-23: startLine = endLine = 1 (First Line Only)

**Goal:** Verify extracting only the very first line of a file.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "startLine": 1,
  "endLine": 1
}
```

**Expected:**
- [ ] Exactly 1 line returned (first line of file)
- [ ] Content is the file's first line
- [ ] Minimal output

---

### TC-24: endLine Beyond File Length

**Goal:** Verify behavior when `endLine` exceeds total file lines.

```json
{
  "path": "<WORKSPACE_ROOT>/packages/octocode-mcp/src/index.ts",
  "startLine": 1,
  "endLine": 99999
}
```

**Expected:**
- [ ] Returns all lines from startLine to end of file
- [ ] No error thrown
- [ ] `totalLines` shows actual file length

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Line range | |
| 2 | Match string + context | |
| 3 | Full content | |
| 4 | Char offset + length | |
| 5 | Regex match string | |
| 6 | Case-sensitive match | |
| 7 | Char offset page 2 | |
| 8 | Empty match string | |
| 9 | Large context lines | |
| 10 | Non-existent file (error) | |
| 11 | startLine > endLine (validation) | |
| 12 | fullContent + matchString conflict | |
| 13 | Binary file handling | |
| 14 | Single line extraction | |
| 15 | Match string context lines minimum (boundary) | |
| 16 | Match string max length (boundary) | |
| 17 | CharOffset near end of file | |
| 18 | CharLength exceeding file size | |
| 19 | Directory path instead of file (error) | |
| 20 | Multiple matches in match string | |
| 21 | Match string context lines maximum (boundary) | |
| 22 | Bulk queries (error isolation) | |
| 23 | startLine = endLine = 1 (first line only) | |
| 24 | endLine beyond file length | |

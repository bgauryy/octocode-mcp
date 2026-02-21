# Sanity Test: `githubGetFileContent`

---

## Tool Overview

Reads file content from a GitHub repository. Supports match string extraction with context, line range extraction, and full content retrieval. Provides metadata like `lastModified`, `lastModifiedBy`, and `isPartial`.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning` (wrap bulk in `{ "queries": [{ ... }] }`)
2. **Pagination/Limits** - Test `charOffset`, `charLength` parameters for content pagination
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Hints Validation Checklist
- [ ] Response includes helpful hints for content exploration
- [ ] Hints suggest reading more content, code search, or structure exploration
- [ ] Pagination hints when content is truncated (charOffset/charLength)
- [ ] Status-specific hints present

---

## Test Cases

### TC-1: Match String with Context

**Goal:** Verify `matchString` + `matchStringContextLines` finds target and returns context.

```json
{
  "mainResearchGoal": "Find specific code pattern",
  "researchGoal": "Match string extraction",
  "reasoning": "matchString is the most token-efficient way to read large files",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "matchString": "registerTool",
  "matchStringContextLines": 5
}
```

**Expected:**
- [ ] Match found at correct location
- [ ] 5 lines context before and after
- [ ] `lastModified` and `lastModifiedBy` metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-2: Line Range Extraction

**Goal:** Verify `startLine` + `endLine` returns exact range.

```json
{
  "mainResearchGoal": "Read file header",
  "researchGoal": "Line range extraction",
  "reasoning": "Line range is precise for reading specific sections",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "startLine": 1,
  "endLine": 15
}
```

**Expected:**
- [ ] Lines 1 through 15 returned
- [ ] Content matches actual file on GitHub
- [ ] `isPartial` metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-3: Full Content (Small File)

**Goal:** Verify `fullContent: true` returns the complete file.

```json
{
  "mainResearchGoal": "Read complete config file",
  "researchGoal": "Full content retrieval",
  "reasoning": "Full content for small config files",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "package.json",
  "fullContent": true
}
```

**Expected:**
- [ ] Entire file content returned
- [ ] `isPartial: false`
- [ ] Valid JSON content
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-4: Large Context Lines

**Goal:** Verify large `matchStringContextLines` value works.

```json
{
  "mainResearchGoal": "Read large section around match",
  "researchGoal": "Extended context window",
  "reasoning": "Large context provides more surrounding code",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "matchString": "export",
  "matchStringContextLines": 20
}
```

**Expected:**
- [ ] Up to 20 lines context before and after
- [ ] Does not error on file boundaries
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-5: Non-Existent Match

**Goal:** Verify graceful behavior when matchString finds nothing.

```json
{
  "mainResearchGoal": "Test empty match handling",
  "researchGoal": "No match scenario",
  "reasoning": "Tool should handle missing matches gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "matchString": "NONEXISTENT_STRING_XYZ_99999",
  "matchStringContextLines": 5
}
```

**Expected:**
- [ ] No error thrown
- [ ] Clear indication of no matches
- [ ] File metadata still returned
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-6: Code Archaeology Metadata

**Goal:** Verify `lastModified` and `lastModifiedBy` are present.

```json
{
  "mainResearchGoal": "Check file modification history",
  "researchGoal": "Verify metadata fields",
  "reasoning": "Metadata is crucial for code archaeology",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "README.md",
  "startLine": 1,
  "endLine": 5
}
```

**Expected:**
- [ ] `lastModified` timestamp present
- [ ] `lastModifiedBy` author present
- [ ] Dates are valid ISO timestamps
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-7: Branch-Specific Content

**Goal:** Verify content is from the specified branch.

```json
{
  "mainResearchGoal": "Read from specific branch",
  "researchGoal": "Branch-specific content",
  "reasoning": "Branch selection affects file content",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "README.md",
  "branch": "main",
  "startLine": 1,
  "endLine": 10
}
```

**Expected:**
- [ ] Content matches `main` branch version
- [ ] Branch info in response
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-8: CharOffset + CharLength

**Goal:** Verify `charOffset` + `charLength` for character-based pagination.

```json
{
  "mainResearchGoal": "Test character-based extraction",
  "researchGoal": "CharOffset/CharLength pagination",
  "reasoning": "Character pagination for large files",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "charOffset": 0,
  "charLength": 500
}
```

**Expected:**
- [ ] First 500 characters of file returned
- [ ] Pagination hint for next charOffset
- [ ] `isPartial: true` if file is larger
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-9: Non-Existent File (Error)

**Goal:** Verify graceful handling of missing file.

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "Non-existent file",
  "reasoning": "Tool should handle missing files gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "nonexistent/file/path.ts",
  "fullContent": true
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication file not found
- [ ] No stack trace leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-10: fullContent + matchString Conflict (Validation)

**Goal:** Verify mutually exclusive parameters are rejected.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Mutually exclusive params",
  "reasoning": "fullContent and matchString cannot be combined",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "fullContent": true,
  "matchString": "export"
}
```

**Expected:**
- [ ] Validation error about mutually exclusive parameters
- [ ] Clear error message
- [ ] No content returned
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-11: startLine Without endLine (Validation)

**Goal:** Verify that `startLine` requires `endLine`.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Incomplete line range",
  "reasoning": "startLine and endLine must be used together",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "startLine": 1
}
```

**Expected:**
- [ ] Validation error about missing endLine
- [ ] Clear error message about required pair
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-12: CharLength Minimum (Boundary)

**Goal:** Verify `charLength: 50` (minimum) works correctly.

```json
{
  "mainResearchGoal": "Test charLength boundary",
  "researchGoal": "Minimum charLength",
  "reasoning": "Min charLength should return small chunk",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "charOffset": 0,
  "charLength": 50
}
```

**Expected:**
- [ ] Returns first 50 characters of file
- [ ] Pagination hint for next charOffset
- [ ] `isPartial: true`
- [ ] No error at minimum value
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-13: CharLength Maximum (Boundary)

**Goal:** Verify `charLength: 50000` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test charLength boundary",
  "researchGoal": "Maximum charLength",
  "reasoning": "Max charLength should return large chunk",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "charOffset": 0,
  "charLength": 50000
}
```

**Expected:**
- [ ] Returns up to 50000 characters
- [ ] No timeout or error at maximum value
- [ ] Full file if smaller than 50000 chars
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-14: startLine Beyond File Length

**Goal:** Verify behavior when `startLine` exceeds total file lines.

```json
{
  "mainResearchGoal": "Test boundary behavior",
  "researchGoal": "startLine beyond file",
  "reasoning": "Edge case for out-of-range line numbers",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "startLine": 99999,
  "endLine": 100000
}
```

**Expected:**
- [ ] Empty results or error
- [ ] No crash
- [ ] Clear indication lines don't exist
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-15: endLine Without startLine (Validation)

**Goal:** Verify that `endLine` requires `startLine`.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Incomplete line range",
  "reasoning": "endLine and startLine must be used together",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "endLine": 10
}
```

**Expected:**
- [ ] Validation error about missing startLine
- [ ] Clear error message about required pair
- [ ] No content returned
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-16: Non-Existent Branch (Error)

**Goal:** Verify graceful handling of invalid branch.

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "Non-existent branch",
  "reasoning": "Tool should handle missing branches gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "README.md",
  "branch": "nonexistent-branch-xyz-99999",
  "fullContent": true
}
```

**Expected:**
- [ ] Error message about branch not found
- [ ] No crash
- [ ] Actionable error message
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-17: matchStringContextLines Minimum (Boundary)

**Goal:** Verify `matchStringContextLines: 1` (minimum) works.

```json
{
  "mainResearchGoal": "Test context boundary",
  "researchGoal": "Minimum context lines",
  "reasoning": "Min context should provide minimal surrounding",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "matchString": "export",
  "matchStringContextLines": 1
}
```

**Expected:**
- [ ] 1 line of context before and after
- [ ] Minimal but useful output
- [ ] Much less than default (5 lines)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-18: matchStringContextLines Maximum (Boundary)

**Goal:** Verify `matchStringContextLines: 50` (maximum) works.

```json
{
  "mainResearchGoal": "Test context boundary",
  "researchGoal": "Maximum context lines",
  "reasoning": "Max context should provide extensive surrounding",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "path": "packages/octocode-mcp/src/index.ts",
  "matchString": "export",
  "matchStringContextLines": 50
}
```

**Expected:**
- [ ] Up to 50 lines context before and after
- [ ] Does not exceed file boundaries
- [ ] No error at maximum value
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-19: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid", "reasoning": "Test", "owner": "bgauryy", "repo": "octocode-mcp", "path": "README.md", "startLine": 1, "endLine": 5},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Invalid file", "reasoning": "Test", "owner": "bgauryy", "repo": "octocode-mcp", "path": "nonexistent.ts", "fullContent": true},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid 2", "reasoning": "Test", "owner": "bgauryy", "repo": "octocode-mcp", "path": "package.json", "fullContent": true}
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
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-20: Pagination Test (charOffset + charLength)

**Goal:** Verify `charOffset` and `charLength` parameters control content pagination together.

```json
{
  "queries": [{
    "mainResearchGoal": "Test content pagination",
    "researchGoal": "Verify charOffset and charLength work correctly",
    "reasoning": "Character pagination is essential for large files",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "path": "packages/octocode-mcp/src/index.ts",
    "charOffset": 500,
    "charLength": 500
  }]
}
```

**Expected:**
- [ ] Characters 500-1000 returned (or next 500 chars)
- [ ] Pagination hint for next charOffset
- [ ] `isPartial: true` if file is larger
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning` (bulk in `{ "queries": [{ ... }] }`)
- [ ] **Pagination tests** verify `charOffset`, `charLength` parameters for content management
- [ ] **Hints validation** checks for helpful guidance in all responses

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Match string + context | ✅ | - | ✅ | |
| 2 | Line range | ✅ | - | ✅ | |
| 3 | Full content | ✅ | - | ✅ | |
| 4 | Large context | ✅ | - | ✅ | |
| 5 | Non-existent match | ✅ | - | ✅ | |
| 6 | Code archaeology metadata | ✅ | - | ✅ | |
| 7 | Branch-specific content | ✅ | - | ✅ | |
| 8 | CharOffset + CharLength | ✅ | ✅ | ✅ | |
| 9 | Non-existent file (error) | ✅ | - | ✅ | |
| 10 | fullContent + matchString conflict | ✅ | - | ✅ | |
| 11 | startLine without endLine (validation) | ✅ | - | ✅ | |
| 12 | CharLength minimum (boundary) | ✅ | ✅ | ✅ | |
| 13 | CharLength maximum (boundary) | ✅ | ✅ | ✅ | |
| 14 | startLine beyond file length | ✅ | - | ✅ | |
| 15 | endLine without startLine (validation) | ✅ | - | ✅ | |
| 16 | Non-existent branch (error) | ✅ | - | ✅ | |
| 17 | matchStringContextLines minimum (boundary) | ✅ | - | ✅ | |
| 18 | matchStringContextLines maximum (boundary) | ✅ | - | ✅ | |
| 19 | Bulk queries (error isolation) | ✅ | - | ✅ | |
| 20 | Pagination test (charOffset + charLength) | ✅ | ✅ | ✅ | |

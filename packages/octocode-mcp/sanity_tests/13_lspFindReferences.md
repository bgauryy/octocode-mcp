# Sanity Test: `lspFindReferences`


---

## Tool Overview

Finds all references to a symbol using Language Server Protocol. Supports include/exclude glob patterns, declaration inclusion toggle, pagination, and context lines. Near-perfect tool — best filtering UX in the suite.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `referencesPerPage` + `page`; verify page 2 differs from page 1
3. **Response Validation** - Every Expected section includes explicit response checking
4. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "uri": "<file_path>",
    "symbolName": "symbol_name",
    "lineHint": 123,
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this references lookup",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters
  }]
}
```

### Response Validation Pattern
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

## Prerequisites

All test cases require a prior `localSearchCode` call to obtain `lineHint`. **NEVER call lspFindReferences without a valid lineHint.**

---

## Test Cases

### TC-1: Include Declaration

**Goal:** Verify `includeDeclaration: true` includes the definition in results.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "class ToolError",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find symbol for references lookup",
    "researchGoal": "Locate ToolError class reference",
    "reasoning": "Need lineHint for LSP find references call"
  }]
}
```

**Step 2 — Find references:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_step1>",
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Find all references to ToolError",
    "researchGoal": "Include definition in results",
    "reasoning": "includeDeclaration:true shows definition + usages"
  }]
}
```

**Expected:**
- [ ] Definition included in results
- [ ] `isDefinition: true` flag on the declaration entry
- [ ] All usages across codebase found
- [ ] `symbolKind` metadata present (e.g., "class")
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-2: Exclude Declaration

**Goal:** Verify `includeDeclaration: false` omits the definition.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": false,
    "contextLines": 2,
    "mainResearchGoal": "Find references excluding the declaration",
    "researchGoal": "Verify includeDeclaration:false omits definition",
    "reasoning": "Excluding declaration focuses on usage sites only"
  }]
}
```

**Expected:**
- [ ] Definition excluded from results
- [ ] Count is 1 less than TC-1 (e.g., 31 vs 32)
- [ ] No entry with `isDefinition: true`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-3: Include Pattern (Glob Filter)

**Goal:** Verify `includePattern` filters to matching files only.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "includePattern": ["**/errors/**"],
    "contextLines": 2,
    "mainResearchGoal": "Find references filtered to errors directory",
    "researchGoal": "Verify includePattern filters to matching files only",
    "reasoning": "Include pattern restricts results to relevant paths"
  }]
}
```

**Expected:**
- [ ] Only references from `**/errors/**` paths
- [ ] Filter transparency message: "Filtered: N of M total references match patterns"
- [ ] Fewer results than unfiltered
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-4: Exclude Pattern (Glob Filter)

**Goal:** Verify `excludePattern` removes matching files from results.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "excludePattern": ["**/tests/**"],
    "contextLines": 2,
    "mainResearchGoal": "Find references excluding tests",
    "researchGoal": "Verify excludePattern removes matching files",
    "reasoning": "Exclude tests to focus on production code"
  }]
}
```

**Expected:**
- [ ] No references from `**/tests/**` paths
- [ ] Filter message: "Filtered: N of M total references match patterns"
- [ ] Fewer results than unfiltered (e.g., 20 of 32)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-5: Small Page Size

**Goal:** Verify `referencesPerPage: 5` with pagination.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "referencesPerPage": 5,
    "page": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test small page size pagination",
    "researchGoal": "Verify referencesPerPage:5 limits results",
    "reasoning": "Small page size allows navigation through many references"
  }]
}
```

**Expected:**
- [ ] Max 5 references returned
- [ ] Pagination metadata shows total pages
- [ ] Can navigate to page 2
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest pagination for more results

---

### TC-6: Context Lines Variation

**Goal:** Verify different `contextLines` values affect output.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "contextLines": 3,
    "referencesPerPage": 3,
    "mainResearchGoal": "Test context lines variation",
    "researchGoal": "Verify contextLines:3 shows more context than contextLines:2",
    "reasoning": "More context lines show surrounding code for each reference"
  }]
}
```

**Expected:**
- [ ] 3 lines context before and after each reference
- [ ] More context than `contextLines: 2`
- [ ] Code surrounding each usage visible
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-7: Multi-File References

**Goal:** Verify references across multiple files are found.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "referencesPerPage": 50,
    "contextLines": 1,
    "mainResearchGoal": "Find all references across multiple files",
    "researchGoal": "Verify references span multiple files",
    "reasoning": "Large referencesPerPage ensures multi-file results are visible"
  }]
}
```

**Expected:**
- [ ] References from multiple files
- [ ] `hasMultipleFiles: true` indicator
- [ ] Different file paths in results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-8: Function References

**Goal:** Verify finding references to a function symbol.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "function fetchWithRetries",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find function for references lookup",
    "researchGoal": "Locate fetchWithRetries function reference",
    "reasoning": "Need lineHint for LSP find references call"
  }]
}
```

**Step 2 — Find references:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "fetchWithRetries",
    "lineHint": "<line_from_step1>",
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Find all references to fetchWithRetries",
    "researchGoal": "Verify function definition and call sites found",
    "reasoning": "Function references show all usage points"
  }]
}
```

**Expected:**
- [ ] Definition and all call sites found
- [ ] Call sites show function invocation context
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-9: Type/Interface References

**Goal:** Verify finding references to a type or interface.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "interface.*Query",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find interface for references lookup",
    "researchGoal": "Locate interface reference",
    "reasoning": "Need lineHint for LSP find references call"
  }]
}
```

**Step 2 — Find references:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "<InterfaceName>",
    "lineHint": "<line_from_step1>",
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Find all references to the interface",
    "researchGoal": "Verify type annotations, imports, and usages found",
    "reasoning": "Interface references show all type usage points"
  }]
}
```

**Expected:**
- [ ] Type annotations, imports, and usages all found
- [ ] `symbolKind` shows "interface" or "type"
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis

---

### TC-10: Non-Existent Symbol (Error)

**Goal:** Verify graceful handling when symbol doesn't exist.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "NONEXISTENT_SYMBOL_XYZ_99999",
    "lineHint": 1,
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Test error handling for non-existent symbol",
    "researchGoal": "Verify graceful failure when symbol not found",
    "reasoning": "Error responses should include recovery hints"
  }]
}
```

**Expected:**
- [ ] "Symbol not found" or equivalent error
- [ ] No crash or timeout
- [ ] Clear error message
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] Status-specific hints present (error hints)
  - [ ] Hints suggest recovery (symbol verification, alternative search)
- [ ] **Hints Validation:**
  - [ ] Hints suggest symbol verification, alternative search strategies

---

### TC-11: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting a page beyond available results.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<symbol>",
    "lineHint": "<line>",
    "includeDeclaration": true,
    "referencesPerPage": 5,
    "page": 100,
    "contextLines": 2,
    "mainResearchGoal": "Test page boundary",
    "researchGoal": "Verify behavior when page beyond available",
    "reasoning": "Should handle out-of-range page gracefully"
  }]
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] Status-specific hints present
  - [ ] Hints suggest actionable next steps
- [ ] **Hints Validation:**
  - [ ] Hints suggest pagination adjustment or alternative analysis

---

### TC-12: OrderHint Disambiguation

**Goal:** Verify `orderHint` selects among multiple symbols on same line.

```json
{
  "queries": [{
    "uri": "<file_with_multiple_symbols>",
    "symbolName": "<ambiguous_symbol>",
    "lineHint": "<line>",
    "orderHint": 1,
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Test orderHint disambiguation",
    "researchGoal": "Verify orderHint selects correct symbol",
    "reasoning": "Multiple symbols on same line need disambiguation"
  }]
}
```

**Expected:**
- [ ] Second occurrence of symbol used (orderHint 1 = second, 0-indexed)
- [ ] Different results than `orderHint: 0`
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-13: Include + Exclude Pattern Combined

**Goal:** Verify both `includePattern` and `excludePattern` work together.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "includePattern": ["**/src/**"],
  "excludePattern": ["**/security/**"],
  "contextLines": 2
}
```

**Expected:**
- [ ] Only references from `src/` that are NOT in `security/`
- [ ] Both filters applied simultaneously
- [ ] Filter message shows both patterns

---

### TC-14: References Per Page Maximum (Boundary)

**Goal:** Verify `referencesPerPage: 50` (maximum) works correctly.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "referencesPerPage": 50,
    "page": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test referencesPerPage maximum",
    "researchGoal": "Verify referencesPerPage:50 works",
    "reasoning": "Maximum value should not cause errors"
  }]
}
```

**Expected:**
- [ ] Up to 50 references per page
- [ ] No timeout or error at maximum value
- [ ] All references valid
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-15: References Per Page Minimum (Boundary)

**Goal:** Verify `referencesPerPage: 1` (minimum) returns exactly one reference.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "referencesPerPage": 1,
    "page": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test referencesPerPage minimum",
    "researchGoal": "Verify referencesPerPage:1 returns one reference",
    "reasoning": "Minimum value for focused single-reference view"
  }]
}
```

**Expected:**
- [ ] Exactly 1 reference returned
- [ ] Pagination shows many more pages
- [ ] Can navigate one-by-one
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest pagination for more results

---

### TC-16: Context Lines Minimum (Boundary)

**Goal:** Verify `contextLines: 0` (minimum) returns no surrounding context.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "contextLines": 0,
    "referencesPerPage": 5,
    "mainResearchGoal": "Test contextLines minimum",
    "researchGoal": "Verify contextLines:0 returns no context",
    "reasoning": "Minimal output for compact view"
  }]
}
```

**Expected:**
- [ ] No surrounding context lines
- [ ] Only the reference line shown per result
- [ ] Smallest possible output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-17: Context Lines Maximum (Boundary)

**Goal:** Verify `contextLines: 10` (maximum) provides extensive context.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "contextLines": 10,
    "referencesPerPage": 3,
    "mainResearchGoal": "Test contextLines maximum",
    "researchGoal": "Verify contextLines:10 provides extensive context",
    "reasoning": "Maximum context for deep analysis"
  }]
}
```

**Expected:**
- [ ] 10 lines context before and after each reference
- [ ] Large but valid output
- [ ] No error at maximum value
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-18: Empty Include Pattern Array

**Goal:** Verify behavior with empty `includePattern` array.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "includePattern": [],
    "contextLines": 2,
    "mainResearchGoal": "Test empty includePattern",
    "researchGoal": "Verify empty array behavior",
    "reasoning": "Empty pattern may mean no filter or validation error"
  }]
}
```

**Expected:**
- [ ] All references returned (empty pattern = no filter)
- [ ] Or validation error about empty array
- [ ] Behavior is clear
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] Status-specific hints present
  - [ ] Hints suggest actionable next steps
- [ ] **Hints Validation:**
  - [ ] Hints present for either success or error case

---

### TC-19: Multiple Include Patterns

**Goal:** Verify `includePattern` with multiple glob patterns.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "includePattern": ["**/tools/**", "**/utils/**"],
    "contextLines": 2,
    "mainResearchGoal": "Find references with multiple include patterns",
    "researchGoal": "Verify multiple glob patterns work",
    "reasoning": "OR logic across multiple paths"
  }]
}
```

**Expected:**
- [ ] Only references from `tools/` OR `utils/` paths
- [ ] Filter message shows both patterns
- [ ] Fewer results than unfiltered
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-20: Non-Existent File (Error)

**Goal:** Verify graceful handling when file doesn't exist.

```json
{
  "queries": [{
    "uri": "/nonexistent/path/to/file.ts",
    "symbolName": "test",
    "lineHint": 1,
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Test error handling for non-existent file",
    "researchGoal": "Verify graceful failure when file not found",
    "reasoning": "Error responses should include recovery hints"
  }]
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication file not found
- [ ] No stack trace leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] Status-specific hints present (error hints)
  - [ ] Hints suggest recovery (file path verification)
- [ ] **Hints Validation:**
  - [ ] Hints suggest file path verification, fallback approaches

---

### TC-21: Variable/Constant References

**Goal:** Verify finding references to a constant/variable (not function or type).

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "const MAX_RETRIES",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find constant for references lookup",
    "researchGoal": "Locate MAX_RETRIES constant reference",
    "reasoning": "Need lineHint for LSP find references call"
  }]
}
```

**Step 2 — Find references:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "MAX_RETRIES",
    "lineHint": "<line_from_step1>",
    "includeDeclaration": true,
    "contextLines": 2,
    "mainResearchGoal": "Find all references to MAX_RETRIES",
    "researchGoal": "Verify constant references found",
    "reasoning": "Constant references show declaration + usages"
  }]
}
```

**Expected:**
- [ ] Declaration and all usage sites found
- [ ] Usage contexts visible (assignment, reads)
- [ ] Works for constants (not just functions/types)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest call hierarchy, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps for variable analysis

---

### TC-22: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"uri": "<valid_file>", "symbolName": "ToolError", "lineHint": "<valid_line>", "includeDeclaration": true, "contextLines": 2, "mainResearchGoal": "Bulk test valid query", "researchGoal": "First query should succeed", "reasoning": "Error isolation test"},
    {"uri": "/nonexistent/file.ts", "symbolName": "test", "lineHint": 1, "includeDeclaration": true, "contextLines": 2, "mainResearchGoal": "Bulk test file error", "researchGoal": "Second query should fail", "reasoning": "Error isolation test"},
    {"uri": "<valid_file>", "symbolName": "NONEXISTENT_XYZ", "lineHint": 1, "includeDeclaration": true, "contextLines": 2, "mainResearchGoal": "Bulk test symbol error", "researchGoal": "Third query should fail", "reasoning": "Error isolation test"}
  ]
}
```

**Expected:**
- [ ] First query succeeds with references
- [ ] Second query returns file not found error
- [ ] Third query returns symbol not found error
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array for successful query
  - [ ] Status-specific hints present for each result
  - [ ] Hints suggest call hierarchy, file reading, or recovery per status
- [ ] **Hints Validation:**
  - [ ] Success hints for first query; error recovery hints for second and third

---

### TC-23: Pagination — Page 2 Differs from Page 1

**Goal:** Dedicated pagination test — verify `referencesPerPage` + `page` returns different results for page 2.

**Step 1 — Get page 1:**
```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "referencesPerPage": 5,
    "page": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test pagination page 1",
    "researchGoal": "Get first page of references",
    "reasoning": "Establish baseline for page 2 comparison"
  }]
}
```

**Step 2 — Get page 2:**
```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "ToolError",
    "lineHint": "<line_from_search>",
    "includeDeclaration": true,
    "referencesPerPage": 5,
    "page": 2,
    "contextLines": 2,
    "mainResearchGoal": "Test pagination page 2",
    "researchGoal": "Verify page 2 returns different references",
    "reasoning": "Page 2 must differ from page 1 when total > 5"
  }]
}
```

**Expected:**
- [ ] Page 1 returns first 5 references
- [ ] Page 2 returns next 5 references (different from page 1)
- [ ] No overlap between page 1 and page 2 results
- [ ] Pagination metadata shows total pages > 1
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array with per-query status
  - [ ] `data` includes `references` array with location details
  - [ ] Status-specific hints present
  - [ ] Hints suggest pagination for more results
- [ ] **Hints Validation:**
  - [ ] Hints suggest navigating to other pages or further analysis

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Pagination tests** verify `referencesPerPage` + `page`; page 2 differs from page 1
- [ ] **Response validation** — every Expected section includes explicit response checking
- [ ] **Hints validation** — every test case checks for hints in responses (hints are GOLDEN)

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Response Validation | Status |
|---|-----------|---------|------------|-------|---------------------|--------|
| 1 | Include declaration | ✅ | - | ✅ | ✅ | ✅ |
| 2 | Exclude declaration | ✅ | - | ✅ | ✅ | ✅ |
| 3 | Include pattern (glob) | ✅ | - | ✅ | ✅ | ✅ |
| 4 | Exclude pattern (glob) | ✅ | - | ✅ | ✅ | ✅ |
| 5 | Small page size | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Context lines variation | ✅ | - | ✅ | ✅ | ✅ |
| 7 | Multi-file references | ✅ | - | ✅ | ✅ | ✅ |
| 8 | Function references | ✅ | - | ✅ | ✅ | ✅ |
| 9 | Type/interface references | ✅ | - | ✅ | ✅ | ✅ |
| 10 | Non-existent symbol (error) | ✅ | - | ✅ | ✅ | ✅ |
| 11 | Page beyond available (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 12 | OrderHint disambiguation | ✅ | - | ✅ | ✅ | ✅ |
| 13 | Include + exclude pattern combined | ✅ | - | ✅ | ✅ | ✅ |
| 14 | References per page maximum (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 15 | References per page minimum (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 16 | Context lines minimum (boundary) | ✅ | - | ✅ | ✅ | ✅ |
| 17 | Context lines maximum (boundary) | ✅ | - | ✅ | ✅ | ✅ |
| 18 | Empty include pattern array | ✅ | - | ✅ | ✅ | ✅ |
| 19 | Multiple include patterns | ✅ | - | ✅ | ✅ | ✅ |
| 20 | Non-existent file (error) | ✅ | - | ✅ | ✅ | ✅ |
| 21 | Variable/constant references | ✅ | - | ✅ | ✅ | ✅ |
| 22 | Bulk queries (error isolation) | ✅ | - | ✅ | ✅ | ✅ |
| 23 | Pagination — page 2 differs from page 1 | ✅ | ✅ | ✅ | ✅ | ✅ |

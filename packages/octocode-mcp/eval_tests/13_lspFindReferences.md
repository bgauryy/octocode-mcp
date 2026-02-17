# Eval Test: `lspFindReferences`

> **Rating: 9.5/10** | Category: LSP | Last tested: Feb 17, 2026

---

## Tool Overview

Finds all references to a symbol using Language Server Protocol. Supports include/exclude glob patterns, declaration inclusion toggle, pagination, and context lines. Near-perfect tool — best filtering UX in the suite.

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
  "pattern": "class ToolError",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Find references:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_step1>",
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] Definition included in results
- [ ] `isDefinition: true` flag on the declaration entry
- [ ] All usages across codebase found
- [ ] `symbolKind` metadata present (e.g., "class")

---

### TC-2: Exclude Declaration

**Goal:** Verify `includeDeclaration: false` omits the definition.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": false,
  "contextLines": 2
}
```

**Expected:**
- [ ] Definition excluded from results
- [ ] Count is 1 less than TC-1 (e.g., 31 vs 32)
- [ ] No entry with `isDefinition: true`

---

### TC-3: Include Pattern (Glob Filter)

**Goal:** Verify `includePattern` filters to matching files only.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "includePattern": ["**/errors/**"],
  "contextLines": 2
}
```

**Expected:**
- [ ] Only references from `**/errors/**` paths
- [ ] Filter transparency message: "Filtered: N of M total references match patterns"
- [ ] Fewer results than unfiltered

---

### TC-4: Exclude Pattern (Glob Filter)

**Goal:** Verify `excludePattern` removes matching files from results.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "excludePattern": ["**/tests/**"],
  "contextLines": 2
}
```

**Expected:**
- [ ] No references from `**/tests/**` paths
- [ ] Filter message: "Filtered: N of M total references match patterns"
- [ ] Fewer results than unfiltered (e.g., 20 of 32)

---

### TC-5: Small Page Size

**Goal:** Verify `referencesPerPage: 5` with pagination.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "referencesPerPage": 5,
  "page": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Max 5 references returned
- [ ] Pagination metadata shows total pages
- [ ] Can navigate to page 2

---

### TC-6: Larger Page Size

**Goal:** Verify `referencesPerPage: 10` works.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "referencesPerPage": 10,
  "page": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Up to 10 references per page
- [ ] Pagination adjusted accordingly

---

### TC-7: Context Lines Variation

**Goal:** Verify different `contextLines` values affect output.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "contextLines": 3,
  "referencesPerPage": 3
}
```

**Expected:**
- [ ] 3 lines context before and after each reference
- [ ] More context than `contextLines: 2`
- [ ] Code surrounding each usage visible

---

### TC-8: Multi-File References

**Goal:** Verify references across multiple files are found.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "referencesPerPage": 50,
  "contextLines": 1
}
```

**Expected:**
- [ ] References from multiple files
- [ ] `hasMultipleFiles: true` indicator
- [ ] Different file paths in results

---

### TC-9: Function References

**Goal:** Verify finding references to a function symbol.

**Step 1 — Search:**
```json
localSearchCode: {
  "pattern": "function fetchWithRetries",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Find references:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "fetchWithRetries",
  "lineHint": "<line_from_step1>",
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] Definition and all call sites found
- [ ] Call sites show function invocation context

---

### TC-10: Type/Interface References

**Goal:** Verify finding references to a type or interface.

**Step 1 — Search:**
```json
localSearchCode: {
  "pattern": "interface.*Query",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Find references:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "<InterfaceName>",
  "lineHint": "<line_from_step1>",
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] Type annotations, imports, and usages all found
- [ ] `symbolKind` shows "interface" or "type"

---

### TC-11: Non-Existent Symbol (Error)

**Goal:** Verify graceful handling when symbol doesn't exist.

```json
{
  "uri": "<known_file>",
  "symbolName": "NONEXISTENT_SYMBOL_XYZ_99999",
  "lineHint": 1,
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] "Symbol not found" or equivalent error
- [ ] No crash or timeout
- [ ] Clear error message

---

### TC-12: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting a page beyond available results.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<symbol>",
  "lineHint": "<line>",
  "includeDeclaration": true,
  "referencesPerPage": 5,
  "page": 100,
  "contextLines": 2
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total

---

### TC-13: OrderHint Disambiguation

**Goal:** Verify `orderHint` selects among multiple symbols on same line.

```json
{
  "uri": "<file_with_multiple_symbols>",
  "symbolName": "<ambiguous_symbol>",
  "lineHint": "<line>",
  "orderHint": 1,
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] Second occurrence of symbol used (orderHint 1 = second, 0-indexed)
- [ ] Different results than `orderHint: 0`

---

### TC-14: Include + Exclude Pattern Combined

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

### TC-15: References Per Page Maximum (Boundary)

**Goal:** Verify `referencesPerPage: 50` (maximum) works correctly.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "referencesPerPage": 50,
  "page": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Up to 50 references per page
- [ ] No timeout or error at maximum value
- [ ] All references valid

---

### TC-16: References Per Page Minimum (Boundary)

**Goal:** Verify `referencesPerPage: 1` (minimum) returns exactly one reference.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "referencesPerPage": 1,
  "page": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Exactly 1 reference returned
- [ ] Pagination shows many more pages
- [ ] Can navigate one-by-one

---

### TC-17: Context Lines Minimum (Boundary)

**Goal:** Verify `contextLines: 0` (minimum) returns no surrounding context.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "contextLines": 0,
  "referencesPerPage": 5
}
```

**Expected:**
- [ ] No surrounding context lines
- [ ] Only the reference line shown per result
- [ ] Smallest possible output

---

### TC-18: Context Lines Maximum (Boundary)

**Goal:** Verify `contextLines: 10` (maximum) provides extensive context.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "contextLines": 10,
  "referencesPerPage": 3
}
```

**Expected:**
- [ ] 10 lines context before and after each reference
- [ ] Large but valid output
- [ ] No error at maximum value

---

### TC-19: Empty Include Pattern Array

**Goal:** Verify behavior with empty `includePattern` array.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "includePattern": [],
  "contextLines": 2
}
```

**Expected:**
- [ ] All references returned (empty pattern = no filter)
- [ ] Or validation error about empty array
- [ ] Behavior is clear

---

### TC-20: Multiple Include Patterns

**Goal:** Verify `includePattern` with multiple glob patterns.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "ToolError",
  "lineHint": "<line_from_search>",
  "includeDeclaration": true,
  "includePattern": ["**/tools/**", "**/utils/**"],
  "contextLines": 2
}
```

**Expected:**
- [ ] Only references from `tools/` OR `utils/` paths
- [ ] Filter message shows both patterns
- [ ] Fewer results than unfiltered

---

### TC-21: Non-Existent File (Error)

**Goal:** Verify graceful handling when file doesn't exist.

```json
{
  "uri": "/nonexistent/path/to/file.ts",
  "symbolName": "test",
  "lineHint": 1,
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication file not found
- [ ] No stack trace leaked

---

### TC-22: Variable/Constant References

**Goal:** Verify finding references to a constant/variable (not function or type).

**Step 1 — Search:**
```json
localSearchCode: {
  "pattern": "const MAX_RETRIES",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Find references:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "MAX_RETRIES",
  "lineHint": "<line_from_step1>",
  "includeDeclaration": true,
  "contextLines": 2
}
```

**Expected:**
- [ ] Declaration and all usage sites found
- [ ] Usage contexts visible (assignment, reads)
- [ ] Works for constants (not just functions/types)

---

### TC-23: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"uri": "<valid_file>", "symbolName": "ToolError", "lineHint": "<valid_line>", "includeDeclaration": true, "contextLines": 2},
    {"uri": "/nonexistent/file.ts", "symbolName": "test", "lineHint": 1, "includeDeclaration": true, "contextLines": 2},
    {"uri": "<valid_file>", "symbolName": "NONEXISTENT_XYZ", "lineHint": 1, "includeDeclaration": true, "contextLines": 2}
  ]
}
```

**Expected:**
- [ ] First query succeeds with references
- [ ] Second query returns file not found error
- [ ] Third query returns symbol not found error
- [ ] Each result isolated per query
- [ ] No cascade failure

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Include declaration | |
| 2 | Exclude declaration | |
| 3 | Include pattern (glob) | |
| 4 | Exclude pattern (glob) | |
| 5 | Small page size | |
| 6 | Larger page size | |
| 7 | Context lines variation | |
| 8 | Multi-file references | |
| 9 | Function references | |
| 10 | Type/interface references | |
| 11 | Non-existent symbol (error) | |
| 12 | Page beyond available (boundary) | |
| 13 | OrderHint disambiguation | |
| 14 | Include + exclude pattern combined | |
| 15 | References per page maximum (boundary) | |
| 16 | References per page minimum (boundary) | |
| 17 | Context lines minimum (boundary) | |
| 18 | Context lines maximum (boundary) | |
| 19 | Empty include pattern array | |
| 20 | Multiple include patterns | |
| 21 | Non-existent file (error) | |
| 22 | Variable/constant references | |
| 23 | Bulk queries (error isolation) | |

# Sanity Test: `lspCallHierarchy`

---

## Tool Overview

Traces call hierarchies using Language Server Protocol. Supports incoming (who calls this?) and outgoing (what does this call?) directions, multi-level depth, pagination, and context lines. Known issue: `depth: 2` produces extremely large output (~101KB).

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `callsPerPage` + `page`; verify page 2 differs from page 1
3. **Response Validation** - Every Expected section includes explicit response checking
4. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "uri": "<file_path>",
    "symbolName": "symbol_name",
    "lineHint": 123,
    "direction": "incoming",
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this call hierarchy",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters
  }]
}
```

### Response Validation Pattern
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields (call hierarchy)
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis

---

## Prerequisites

All test cases require a prior `localSearchCode` call to obtain `lineHint`. **NEVER call lspCallHierarchy without a valid lineHint.**

**Important:** Only use on functions/methods. For types, interfaces, and variables, use `lspFindReferences` instead.

---

## Test Cases

### TC-1: Incoming Calls (Who Calls This?)

**Goal:** Verify `direction: "incoming"` finds all callers.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "function fetchWithRetries",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find function for call hierarchy",
    "researchGoal": "Locate fetchWithRetries function reference",
    "reasoning": "Need lineHint for LSP call hierarchy call"
  }]
}
```

**Step 2 — Call hierarchy:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "fetchWithRetries",
    "lineHint": "<line_from_step1>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Find who calls fetchWithRetries",
    "researchGoal": "Trace incoming call hierarchy",
    "reasoning": "Incoming direction shows all callers"
  }]
}
```

**Expected:**
- [ ] All callers of `fetchWithRetries` found
- [ ] `fromRanges` shows exact call-site locations within each caller
- [ ] Caller function body visible with context
- [ ] Correct number of callers (3+ expected)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest find references, file reading, or further analysis

---

### TC-2: Outgoing Calls (What Does This Call?)

**Goal:** Verify `direction: "outgoing"` shows callees.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "fetchWithRetries",
    "lineHint": "<line_from_search>",
    "direction": "outgoing",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Find what fetchWithRetries calls",
    "researchGoal": "Trace outgoing call hierarchy",
    "reasoning": "Outgoing direction shows callees"
  }]
}
```

**Expected:**
- [ ] All functions called by `fetchWithRetries` listed
- [ ] Or empty if it's a leaf function (no callees)
- [ ] Call sites within the function body shown
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-3: Leaf Function (No Callees)

**Goal:** Verify outgoing calls on a function with no callees returns empty.

**Step 1 — Search for a simple/leaf function:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "function isToolError",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find leaf function for call hierarchy",
    "researchGoal": "Locate isToolError function reference",
    "reasoning": "Leaf function has no callees"
  }]
}
```

**Step 2 — Outgoing hierarchy:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "isToolError",
    "lineHint": "<line_from_step1>",
    "direction": "outgoing",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Verify leaf function has no callees",
    "researchGoal": "Outgoing on leaf returns empty",
    "reasoning": "Empty callees is correct for leaf"
  }]
}
```

**Expected:**
- [ ] Empty callees list (correct for leaf function)
- [ ] No error thrown
- [ ] Function definition still shown
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present (empty callees)
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references or alternative analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps (e.g., find references for usage)

---

### TC-4: Depth 1 (Single Level)

**Goal:** Verify `depth: 1` traces one level only.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function_name>",
    "lineHint": "<line_from_search>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Trace single-level call hierarchy",
    "researchGoal": "Verify depth:1 shows only direct callers",
    "reasoning": "Depth 1 avoids large transitive output"
  }]
}
```

**Expected:**
- [ ] Only direct callers (no transitive callers)
- [ ] Manageable output size
- [ ] Pagination available if many callers
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-5: Depth 2 (Two-Level Chain) — Known Large Output

**Goal:** Verify `depth: 2` traces two levels. **Warning: large output.**

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function_name>",
    "lineHint": "<line_from_search>",
    "direction": "incoming",
    "depth": 2,
    "contextLines": 2,
    "mainResearchGoal": "Trace two-level call hierarchy",
    "researchGoal": "Verify depth:2 shows callers-of-callers",
    "reasoning": "Depth 2 expands full tree — large output expected"
  }]
}
```

**Expected:**
- [ ] Two levels of callers (callers + callers-of-callers)
- [ ] Output ~101KB for well-connected functions — **Design:** depth=2 expands full tree
- [ ] Response still succeeds (no timeout)
- [ ] Chain structure visible in results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps (pagination, charOffset for large output)

---

### TC-6: Calls Per Page Pagination

**Goal:** Verify `callsPerPage` controls page size.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function_name>",
    "lineHint": "<line_from_search>",
    "direction": "incoming",
    "depth": 1,
    "callsPerPage": 10,
    "contextLines": 2,
    "mainResearchGoal": "Test callsPerPage pagination",
    "researchGoal": "Verify callsPerPage limits results",
    "reasoning": "Pagination controls response size"
  }]
}
```

**Expected:**
- [ ] At most 10 calls per page
- [ ] Pagination metadata present
- [ ] Can navigate to page 2
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest pagination for more results

---

### TC-7: Context Lines Variation

**Goal:** Verify different `contextLines` values affect output.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function_name>",
    "lineHint": "<line_from_search>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 3,
    "callsPerPage": 5,
    "mainResearchGoal": "Test context lines variation",
    "researchGoal": "Verify contextLines affects output",
    "reasoning": "More context shows caller body"
  }]
}
```

**Expected:**
- [ ] 3 lines context before and after each caller
- [ ] Caller function body + call site visible
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-8: Minimal Context

**Goal:** Verify `contextLines: 0` for compact output.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function_name>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 0,
  "callsPerPage": 5
}
```

**Expected:**
- [ ] No surrounding context
- [ ] Only the call hierarchy structure
- [ ] Smallest possible output

---

### TC-9: Manual Chaining (Recommended Pattern)

**Goal:** Verify depth=1 chaining is more efficient than depth=2.

**Step 1 — Depth 1 incoming:**
```json
{
  "queries": [{
    "uri": "<file>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Manual chaining step 1",
    "researchGoal": "Get first level of callers",
    "reasoning": "Depth 1 more efficient than depth 2"
  }]
}
```

**Step 2 — For each caller, repeat depth 1:**
```json
{
  "queries": [{
    "uri": "<caller_file>",
    "symbolName": "<caller_function>",
    "lineHint": "<caller_line>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Manual chaining step 2",
    "researchGoal": "Trace each caller's callers",
    "reasoning": "Chain manually for control"
  }]
}
```

**Expected:**
- [ ] Two separate calls produce same information as depth=2
- [ ] Total output smaller (only relevant branches explored)
- [ ] More control over which branches to follow
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-10: Wrong Symbol Type (Type/Interface)

**Goal:** Verify behavior when used on non-function symbols.

**Step 1 — Search for a type:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "interface.*SearchQuery",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find type for wrong-usage test",
    "researchGoal": "Locate SearchQuery interface",
    "reasoning": "Call hierarchy on types may return empty"
  }]
}
```

**Step 2 — Call hierarchy (wrong usage):**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "<InterfaceName>",
    "lineHint": "<line_from_step1>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test call hierarchy on type",
    "researchGoal": "Verify types return empty/error",
    "reasoning": "Use lspFindReferences for types instead"
  }]
}
```

**Expected:**
- [ ] May return empty/error (types don't have callers)
- [ ] Should use `lspFindReferences` instead for types
- [ ] No crash or timeout
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints present
  - [ ] Hints suggest using lspFindReferences for types
- [ ] **Hints Validation:**
  - [ ] Hints suggest lspFindReferences for type/interface analysis

---

### TC-11: Non-Existent Symbol (Error)

**Goal:** Verify graceful handling when symbol doesn't exist.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "NONEXISTENT_FUNCTION_XYZ_99999",
    "lineHint": 1,
    "direction": "incoming",
    "depth": 1,
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
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints present (error hints)
  - [ ] Hints suggest recovery (symbol verification, use lspFindReferences)
- [ ] **Hints Validation:**
  - [ ] Hints suggest symbol verification, alternative tools (lspFindReferences)

---

### TC-12: Page Navigation (callsPerPage + page — Page 2 Differs)

**Goal:** Verify `callsPerPage` + `page` — page 2 returns different callers than page 1.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<well_connected_function>",
    "lineHint": "<line_from_search>",
    "direction": "incoming",
    "depth": 1,
    "callsPerPage": 3,
    "page": 2,
    "contextLines": 2,
    "mainResearchGoal": "Test pagination page 2",
    "researchGoal": "Verify page 2 returns different callers",
    "reasoning": "Page 2 must differ from page 1 when total > 3"
  }]
}
```

**Expected:**
- [ ] Different callers than page 1
- [ ] No overlap with first page
- [ ] Pagination metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest pagination for more results
- [ ] **Hints Validation:**
  - [ ] Hints suggest navigating to other pages or further analysis

---

### TC-13: Depth 3 Maximum (Boundary)

**Goal:** Verify `depth: 3` (maximum) works correctly.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 3,
    "callsPerPage": 5,
    "contextLines": 1,
    "mainResearchGoal": "Test depth maximum boundary",
    "researchGoal": "Verify depth:3 traces three levels",
    "reasoning": "Maximum depth may produce very large output"
  }]
}
```

**Expected:**
- [ ] Three levels of callers traced
- [ ] Output may be very large
- [ ] No timeout (may be slow)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps (charOffset for large output)

---

### TC-14: CharOffset/CharLength Output Pagination

**Goal:** Verify `charOffset` + `charLength` truncate large call hierarchy outputs.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 2,
    "contextLines": 2,
    "charOffset": 0,
    "charLength": 5000,
    "mainResearchGoal": "Test charOffset/charLength truncation",
    "researchGoal": "Verify output truncation for large hierarchies",
    "reasoning": "Mitigates large output from depth 2"
  }]
}
```

**Expected:**
- [ ] Output truncated to ~5000 characters
- [ ] Pagination hint for next charOffset
- [ ] Mitigates the large output issue (TC-5)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present (charOffset pagination hint)
  - [ ] Hints suggest next charOffset for more content
- [ ] **Hints Validation:**
  - [ ] Hints suggest charOffset for next chunk

---

### TC-15: Function With No Callers (Empty Incoming)

**Goal:** Verify incoming calls on an unused/entry-point function returns empty.

**Step 1 — Search for a rarely-used function:**
```json
localSearchCode: {
  "pattern": "function main",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Incoming hierarchy:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "main",
  "lineHint": "<line_from_step1>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Empty callers list (entry point function)
- [ ] No error thrown
- [ ] Function definition still shown

---

### TC-16: OrderHint Disambiguation

**Goal:** Verify `orderHint` selects among multiple symbols on same line.

```json
{
  "queries": [{
    "uri": "<file_with_multiple_functions_on_same_line>",
    "symbolName": "<ambiguous_function>",
    "lineHint": "<line>",
    "orderHint": 1,
    "direction": "incoming",
    "depth": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test orderHint disambiguation",
    "researchGoal": "Verify orderHint selects correct symbol",
    "reasoning": "Multiple symbols on same line need disambiguation"
  }]
}
```

**Expected:**
- [ ] Second occurrence of symbol used (orderHint 1 = second, 0-indexed)
- [ ] Different results than orderHint: 0
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-17: CallsPerPage Maximum (Boundary)

**Goal:** Verify `callsPerPage: 30` (maximum) works correctly.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<well_connected_function>",
    "lineHint": "<line_from_search>",
    "direction": "incoming",
    "depth": 1,
    "callsPerPage": 30,
    "contextLines": 2,
    "mainResearchGoal": "Test callsPerPage maximum",
    "researchGoal": "Verify callsPerPage:30 works",
    "reasoning": "Maximum value should not cause errors"
  }]
}
```

**Expected:**
- [ ] Up to 30 calls per page
- [ ] No error at maximum value
- [ ] All entries valid
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-18: CallsPerPage Minimum (Boundary)

**Goal:** Verify `callsPerPage: 1` (minimum) returns exactly one caller.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 1,
    "callsPerPage": 1,
    "contextLines": 2,
    "mainResearchGoal": "Test callsPerPage minimum",
    "researchGoal": "Verify callsPerPage:1 returns one caller",
    "reasoning": "Minimum value for focused single-caller view"
  }]
}
```

**Expected:**
- [ ] Exactly 1 call per page
- [ ] Pagination shows many more pages
- [ ] Can navigate page by page
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest pagination for more results
- [ ] **Hints Validation:**
  - [ ] Hints suggest pagination for more callers

---

### TC-19: Context Lines Maximum (Boundary)

**Goal:** Verify `contextLines: 10` (maximum) works correctly.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 10,
    "callsPerPage": 3,
    "mainResearchGoal": "Test contextLines maximum",
    "researchGoal": "Verify contextLines:10 provides extensive context",
    "reasoning": "Maximum context for deep analysis"
  }]
}
```

**Expected:**
- [ ] 10 lines context before and after each caller
- [ ] Large but valid output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-20: CharOffset + CharLength Combined with Minimal Context

**Goal:** Verify `charOffset`/`charLength` combined with `contextLines: 0` for minimal output.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 1,
    "contextLines": 0,
    "charOffset": 0,
    "charLength": 2000,
    "mainResearchGoal": "Test minimal output with truncation",
    "researchGoal": "Verify charOffset + contextLines:0",
    "reasoning": "Minimal output for token efficiency"
  }]
}
```

**Expected:**
- [ ] Compact output truncated to ~2000 chars
- [ ] No surrounding context
- [ ] Pagination hint for next charOffset
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present (charOffset pagination)
  - [ ] Hints suggest next charOffset for more content
- [ ] **Hints Validation:**
  - [ ] Hints suggest charOffset for next chunk

---

### TC-21: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available results.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function>",
    "lineHint": "<line>",
    "direction": "incoming",
    "depth": 1,
    "callsPerPage": 5,
    "page": 999,
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
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints present
  - [ ] Hints suggest pagination adjustment
- [ ] **Hints Validation:**
  - [ ] Hints suggest pagination or alternative analysis

---

### TC-22: Non-Existent File (Error)

**Goal:** Verify graceful handling when file doesn't exist.

```json
{
  "queries": [{
    "uri": "/nonexistent/path/to/file.ts",
    "symbolName": "test",
    "lineHint": 1,
    "direction": "incoming",
    "depth": 1,
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
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints present (error hints)
  - [ ] Hints suggest recovery (file path verification)
- [ ] **Hints Validation:**
  - [ ] Hints suggest file path verification, fallback approaches

---

### TC-23: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries — one failure doesn't affect others.

```json
{
  "queries": [
    {"uri": "<valid_file>", "symbolName": "<valid_fn>", "lineHint": "<line>", "direction": "incoming", "depth": 1, "contextLines": 2, "mainResearchGoal": "Bulk test valid query", "researchGoal": "First query should succeed", "reasoning": "Error isolation test"},
    {"uri": "/nonexistent/file.ts", "symbolName": "test", "lineHint": 1, "direction": "incoming", "depth": 1, "contextLines": 2, "mainResearchGoal": "Bulk test file error", "researchGoal": "Second query should fail", "reasoning": "Error isolation test"},
    {"uri": "<valid_file>", "symbolName": "NONEXISTENT_XYZ", "lineHint": 1, "direction": "outgoing", "depth": 1, "contextLines": 2, "mainResearchGoal": "Bulk test symbol error", "researchGoal": "Third query should fail", "reasoning": "Error isolation test"}
  ]
}
```

**Expected:**
- [ ] First query succeeds with call hierarchy
- [ ] Second and third return errors
- [ ] Each result isolated per query
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present for successful query
  - [ ] Status-specific hints present for each result
  - [ ] Hints suggest find references, file reading, or recovery per status
- [ ] **Hints Validation:**
  - [ ] Success hints for first query; error recovery hints for second and third

---

### TC-24: Outgoing Depth 2

**Goal:** Verify `direction: "outgoing"` with `depth: 2` traces two levels of callees.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<function_that_calls_others>",
    "lineHint": "<line>",
    "direction": "outgoing",
    "depth": 2,
    "contextLines": 2,
    "callsPerPage": 10,
    "mainResearchGoal": "Trace outgoing two-level hierarchy",
    "researchGoal": "Verify outgoing depth:2 shows callees-of-callees",
    "reasoning": "Outgoing direction traces what function calls"
  }]
}
```

**Expected:**
- [ ] Two levels of callees (what function calls + what those functions call)
- [ ] Chain structure visible
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with call hierarchy
  - [ ] Status-specific hints present
  - [ ] Hints suggest find references, file reading, or further analysis
- [ ] **Hints Validation:**
  - [ ] Hints suggest actionable next steps relevant to the query

---

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Pagination tests** verify `callsPerPage` + `page`; page 2 differs from page 1
- [ ] **Response validation** — every Expected section includes explicit response checking
- [ ] **Hints validation** — every test case checks for hints in responses (hints are GOLDEN)

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Response Validation | Status |
|---|-----------|---------|------------|-------|---------------------|--------|
| 1 | Incoming calls | ✅ | - | ✅ | ✅ | ✅ |
| 2 | Outgoing calls | ✅ | - | ✅ | ✅ | ✅ |
| 3 | Leaf function (no callees) | ✅ | - | ✅ | ✅ | ✅ |
| 4 | Depth 1 | ✅ | - | ✅ | ✅ | ✅ |
| 5 | Depth 2 (large output) | ✅ | - | ✅ | ✅ | ✅ |
| 6 | Calls per page | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | Context lines variation | ✅ | - | ✅ | ✅ | ✅ |
| 8 | Minimal context | ✅ | - | ✅ | ✅ | ✅ |
| 9 | Manual chaining pattern | ✅ | - | ✅ | ✅ | ✅ |
| 10 | Wrong symbol type | ✅ | - | ✅ | ✅ | ✅ |
| 11 | Non-existent symbol (error) | ✅ | - | ✅ | ✅ | ✅ |
| 12 | Page navigation (page 2 differs) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 13 | Depth 3 maximum (boundary) | ✅ | - | ✅ | ✅ | ✅ |
| 14 | CharOffset/CharLength pagination | ✅ | - | ✅ | ✅ | ✅ |
| 15 | Function with no callers | ✅ | - | ✅ | ✅ | ✅ |
| 16 | OrderHint disambiguation | ✅ | - | ✅ | ✅ | ✅ |
| 17 | CallsPerPage maximum (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 18 | CallsPerPage minimum (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 19 | Context lines maximum (boundary) | ✅ | - | ✅ | ✅ | ✅ |
| 20 | CharOffset + CharLength with minimal context | ✅ | - | ✅ | ✅ | ✅ |
| 21 | Page beyond available (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 22 | Non-existent file (error) | ✅ | - | ✅ | ✅ | ✅ |
| 23 | Bulk queries (error isolation) | ✅ | - | ✅ | ✅ | ✅ |
| 24 | Outgoing depth 2 | ✅ | - | ✅ | ✅ | ✅ |

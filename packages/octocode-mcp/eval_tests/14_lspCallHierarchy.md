# Eval Test: `lspCallHierarchy`

> **Rating: 8/10** | Category: LSP | Last tested: Feb 17, 2026

---

## Tool Overview

Traces call hierarchies using Language Server Protocol. Supports incoming (who calls this?) and outgoing (what does this call?) directions, multi-level depth, pagination, and context lines. Known issue: `depth: 2` produces extremely large output (~101KB).

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
  "pattern": "function fetchWithRetries",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Call hierarchy:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "fetchWithRetries",
  "lineHint": "<line_from_step1>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] All callers of `fetchWithRetries` found
- [ ] `fromRanges` shows exact call-site locations within each caller
- [ ] Caller function body visible with context
- [ ] Correct number of callers (3+ expected)

---

### TC-2: Outgoing Calls (What Does This Call?)

**Goal:** Verify `direction: "outgoing"` shows callees.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "fetchWithRetries",
  "lineHint": "<line_from_search>",
  "direction": "outgoing",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] All functions called by `fetchWithRetries` listed
- [ ] Or empty if it's a leaf function (no callees)
- [ ] Call sites within the function body shown

---

### TC-3: Leaf Function (No Callees)

**Goal:** Verify outgoing calls on a function with no callees returns empty.

**Step 1 — Search for a simple/leaf function:**
```json
localSearchCode: {
  "pattern": "function isToolError",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Outgoing hierarchy:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "isToolError",
  "lineHint": "<line_from_step1>",
  "direction": "outgoing",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Empty callees list (correct for leaf function)
- [ ] No error thrown
- [ ] Function definition still shown

---

### TC-4: Depth 1 (Single Level)

**Goal:** Verify `depth: 1` traces one level only.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function_name>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Only direct callers (no transitive callers)
- [ ] Manageable output size
- [ ] Pagination available if many callers

---

### TC-5: Depth 2 (Two-Level Chain) — Known Large Output

**Goal:** Verify `depth: 2` traces two levels. **Warning: large output.**

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function_name>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 2,
  "contextLines": 2
}
```

**Expected:**
- [ ] Two levels of callers (callers + callers-of-callers)
- [ ] Output ~101KB for well-connected functions — **Design:** depth=2 expands full tree
- [ ] Response still succeeds (no timeout)
- [ ] Chain structure visible in results

---

### TC-6: Calls Per Page Pagination

**Goal:** Verify `callsPerPage` controls page size.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function_name>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 1,
  "callsPerPage": 10,
  "contextLines": 2
}
```

**Expected:**
- [ ] At most 10 calls per page
- [ ] Pagination metadata present
- [ ] Can navigate to page 2

---

### TC-7: Context Lines Variation

**Goal:** Verify different `contextLines` values affect output.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function_name>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 3,
  "callsPerPage": 5
}
```

**Expected:**
- [ ] 3 lines context before and after each caller
- [ ] Caller function body + call site visible

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
  "uri": "<file>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Step 2 — For each caller, repeat depth 1:**
```json
{
  "uri": "<caller_file>",
  "symbolName": "<caller_function>",
  "lineHint": "<caller_line>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Two separate calls produce same information as depth=2
- [ ] Total output smaller (only relevant branches explored)
- [ ] More control over which branches to follow

---

### TC-10: Wrong Symbol Type (Type/Interface)

**Goal:** Verify behavior when used on non-function symbols.

**Step 1 — Search for a type:**
```json
localSearchCode: {
  "pattern": "interface.*SearchQuery",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Call hierarchy (wrong usage):**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "<InterfaceName>",
  "lineHint": "<line_from_step1>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] May return empty/error (types don't have callers)
- [ ] Should use `lspFindReferences` instead for types
- [ ] No crash or timeout

---

### TC-11: Non-Existent Symbol (Error)

**Goal:** Verify graceful handling when symbol doesn't exist.

```json
{
  "uri": "<known_file>",
  "symbolName": "NONEXISTENT_FUNCTION_XYZ_99999",
  "lineHint": 1,
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] "Symbol not found" or equivalent error
- [ ] No crash or timeout
- [ ] Clear error message

---

### TC-12: Page Navigation

**Goal:** Verify `page` parameter for paginating call hierarchy results.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<well_connected_function>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 1,
  "callsPerPage": 3,
  "page": 2,
  "contextLines": 2
}
```

**Expected:**
- [ ] Different callers than page 1
- [ ] No overlap with first page
- [ ] Pagination metadata present

---

### TC-13: Depth 3 Maximum (Boundary)

**Goal:** Verify `depth: 3` (maximum) works correctly.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 3,
  "callsPerPage": 5,
  "contextLines": 1
}
```

**Expected:**
- [ ] Three levels of callers traced
- [ ] Output may be very large
- [ ] No timeout (may be slow)

---

### TC-14: CharOffset/CharLength Output Pagination

**Goal:** Verify `charOffset` + `charLength` truncate large call hierarchy outputs.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 2,
  "contextLines": 2,
  "charOffset": 0,
  "charLength": 5000
}
```

**Expected:**
- [ ] Output truncated to ~5000 characters
- [ ] Pagination hint for next charOffset
- [ ] Mitigates the large output issue (TC-5)

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
  "uri": "<file_with_multiple_functions_on_same_line>",
  "symbolName": "<ambiguous_function>",
  "lineHint": "<line>",
  "orderHint": 1,
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Second occurrence of symbol used (orderHint 1 = second, 0-indexed)
- [ ] Different results than orderHint: 0

---

### TC-17: CallsPerPage Maximum (Boundary)

**Goal:** Verify `callsPerPage: 30` (maximum) works correctly.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<well_connected_function>",
  "lineHint": "<line_from_search>",
  "direction": "incoming",
  "depth": 1,
  "callsPerPage": 30,
  "contextLines": 2
}
```

**Expected:**
- [ ] Up to 30 calls per page
- [ ] No error at maximum value
- [ ] All entries valid

---

### TC-18: CallsPerPage Minimum (Boundary)

**Goal:** Verify `callsPerPage: 1` (minimum) returns exactly one caller.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 1,
  "callsPerPage": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Exactly 1 call per page
- [ ] Pagination shows many more pages
- [ ] Can navigate page by page

---

### TC-19: Context Lines Maximum (Boundary)

**Goal:** Verify `contextLines: 10` (maximum) works correctly.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 10,
  "callsPerPage": 3
}
```

**Expected:**
- [ ] 10 lines context before and after each caller
- [ ] Large but valid output

---

### TC-20: CharOffset + CharLength Combined with Minimal Context

**Goal:** Verify `charOffset`/`charLength` combined with `contextLines: 0` for minimal output.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 1,
  "contextLines": 0,
  "charOffset": 0,
  "charLength": 2000
}
```

**Expected:**
- [ ] Compact output truncated to ~2000 chars
- [ ] No surrounding context
- [ ] Pagination hint for next charOffset

---

### TC-21: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available results.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function>",
  "lineHint": "<line>",
  "direction": "incoming",
  "depth": 1,
  "callsPerPage": 5,
  "page": 999,
  "contextLines": 2
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total

---

### TC-22: Non-Existent File (Error)

**Goal:** Verify graceful handling when file doesn't exist.

```json
{
  "uri": "/nonexistent/path/to/file.ts",
  "symbolName": "test",
  "lineHint": 1,
  "direction": "incoming",
  "depth": 1,
  "contextLines": 2
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication file not found
- [ ] No stack trace leaked

---

### TC-23: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries — one failure doesn't affect others.

```json
{"queries": [
  {"uri": "<valid_file>", "symbolName": "<valid_fn>", "lineHint": "<line>", "direction": "incoming", "depth": 1, "contextLines": 2},
  {"uri": "/nonexistent/file.ts", "symbolName": "test", "lineHint": 1, "direction": "incoming", "depth": 1, "contextLines": 2},
  {"uri": "<valid_file>", "symbolName": "NONEXISTENT_XYZ", "lineHint": 1, "direction": "outgoing", "depth": 1, "contextLines": 2}
]}
```

**Expected:**
- [ ] First query succeeds with call hierarchy
- [ ] Second and third return errors
- [ ] Each result isolated per query

---

### TC-24: Outgoing Depth 2

**Goal:** Verify `direction: "outgoing"` with `depth: 2` traces two levels of callees.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<function_that_calls_others>",
  "lineHint": "<line>",
  "direction": "outgoing",
  "depth": 2,
  "contextLines": 2,
  "callsPerPage": 10
}
```

**Expected:**
- [ ] Two levels of callees (what function calls + what those functions call)
- [ ] Chain structure visible

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Incoming calls | |
| 2 | Outgoing calls | |
| 3 | Leaf function (no callees) | |
| 4 | Depth 1 | |
| 5 | Depth 2 (large output) | |
| 6 | Calls per page | |
| 7 | Context lines variation | |
| 8 | Minimal context | |
| 9 | Manual chaining pattern | |
| 10 | Wrong symbol type | |
| 11 | Non-existent symbol (error) | |
| 12 | Page navigation | |
| 13 | Depth 3 maximum (boundary) | |
| 14 | CharOffset/CharLength pagination | |
| 15 | Function with no callers | |
| 16 | OrderHint disambiguation | |
| 17 | CallsPerPage maximum (boundary) | |
| 18 | CallsPerPage minimum (boundary) | |
| 19 | Context lines maximum (boundary) | |
| 20 | CharOffset + CharLength with minimal context | |
| 21 | Page beyond available (boundary) | |
| 22 | Non-existent file (error) | |
| 23 | Bulk queries (error isolation) | |
| 24 | Outgoing depth 2 | |

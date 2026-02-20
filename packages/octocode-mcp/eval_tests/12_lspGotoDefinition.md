# Eval Test: `lspGotoDefinition`

> **Rating: 8/10** | Category: LSP | Last tested: Feb 17, 2026

---

## Tool Overview

Navigates to the definition of a symbol using Language Server Protocol. Requires `lineHint` from a prior `localSearchCode` call. Supports `contextLines` to control surrounding code and `orderHint` for disambiguation. Known issue: `orderHint` fails on re-exports.

---

## Prerequisites

All test cases require a prior `localSearchCode` call to obtain `lineHint`. **NEVER call lspGotoDefinition without a valid lineHint.**

---

## Test Cases

### TC-1: Standard Definition Lookup

**Goal:** Verify basic symbol definition navigation with default context.

**Step 1 — Search first:**
```json
localSearchCode: {
  "pattern": "class GithubClient",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Goto definition:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "GithubClient",
  "lineHint": "<line_from_step1>",
  "contextLines": 5
}
```

**Expected:**
- [ ] Navigates to class definition
- [ ] 5 lines of context before and after
- [ ] `resolvedPosition` shows exact character position
- [ ] Definition range clearly marked

---

### TC-2: Context Lines = 0

**Goal:** Verify `contextLines: 0` returns only the definition range.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "GithubClient",
  "lineHint": "<line_from_search>",
  "contextLines": 0
}
```

**Expected:**
- [ ] Only the definition range returned (no surrounding context)
- [ ] `displayRange` shows exact definition lines
- [ ] Much smaller output than with context

---

### TC-3: Context Lines = 10

**Goal:** Verify `contextLines: 10` provides extended context.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "GithubClient",
  "lineHint": "<line_from_search>",
  "contextLines": 10
}
```

**Expected:**
- [ ] 10 lines before and after definition
- [ ] Full class body visible (for short classes)
- [ ] Numbered lines in output

---

### TC-4: Function Definition

**Goal:** Verify navigation to a function definition.

**Step 1 — Search:**
```json
localSearchCode: {
  "pattern": "function fetchWithRetries",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Goto definition:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "fetchWithRetries",
  "lineHint": "<line_from_step1>",
  "contextLines": 5
}
```

**Expected:**
- [ ] Navigates to function definition
- [ ] Function signature visible
- [ ] `searchRadius` info present

---

### TC-5: orderHint for Re-exports

**Goal:** Verify re-export following and `orderHint` semantics.

**Important:** Use `orderHint: 0` (default) for import/re-export lines — they typically have one symbol occurrence. `orderHint: 1` asks for the 2nd occurrence and correctly returns "Symbol not found" when only one exists.

**Step 1 — Search for import:**
```json
localSearchCode: {
  "pattern": "import.*ToolError",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Goto definition (use orderHint: 0 for single-occurrence lines):**
```json
{
  "uri": "<file_with_import>",
  "symbolName": "ToolError",
  "lineHint": "<line_of_import>",
  "orderHint": 0
}
```

**Expected:**
- [ ] Navigates to source definition (not the re-export) via import chaining
- [ ] `orderHint: 0` selects the single occurrence on the import line

---

### TC-6: Type/Interface Definition

**Goal:** Verify navigation to a TypeScript type or interface.

**Step 1 — Search:**
```json
localSearchCode: {
  "pattern": "interface.*Query",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Goto definition:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "<InterfaceName>",
  "lineHint": "<line_from_step1>",
  "contextLines": 5
}
```

**Expected:**
- [ ] Navigates to interface/type definition
- [ ] Full interface body visible with context
- [ ] `symbolKind` or similar metadata present

---

### TC-7: Symbol Not at Hint Line

**Goal:** Verify behavior when `lineHint` is approximate (not exact).

```json
{
  "uri": "<known_file>",
  "symbolName": "<known_symbol>",
  "lineHint": "<line_hint_off_by_5>",
  "contextLines": 5
}
```

**Expected:**
- [ ] Still resolves if within `searchRadius`
- [ ] `searchRadius` shown in response
- [ ] May fail if too far from actual definition

---

### TC-8: Non-Existent Symbol (Error)

**Goal:** Verify graceful handling when symbol doesn't exist at lineHint.

```json
{
  "uri": "<known_file>",
  "symbolName": "NONEXISTENT_SYMBOL_XYZ_99999",
  "lineHint": 1,
  "contextLines": 5
}
```

**Expected:**
- [ ] "Symbol not found" or equivalent error
- [ ] No crash or timeout
- [ ] `searchRadius` info may show search area

---

### TC-9: Non-Existent File (Error)

**Goal:** Verify graceful handling when file doesn't exist.

```json
{
  "uri": "/nonexistent/path/to/file.ts",
  "symbolName": "test",
  "lineHint": 1,
  "contextLines": 5
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication file not found
- [ ] No stack trace leaked

---

### TC-10: Context Lines Max (Boundary)

**Goal:** Verify `contextLines: 20` (maximum) works correctly.

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<symbol>",
  "lineHint": "<line>",
  "contextLines": 20
}
```

**Expected:**
- [ ] Up to 20 lines context before and after
- [ ] No error at maximum value
- [ ] Large but manageable output

---

### TC-11: lineHint = 0 Below Minimum (Validation)

**Goal:** Verify `lineHint` below minimum (1) is rejected.

```json
{
  "uri": "<known_file>",
  "symbolName": "test",
  "lineHint": 0,
  "contextLines": 5
}
```

**Expected:**
- [ ] Validation error (lineHint min is 1)
- [ ] Clear error message
- [ ] No crash

---

### TC-12: Context Lines Beyond File Boundary

**Goal:** Verify `contextLines` gracefully handles file edge (beginning/end).

```json
{
  "uri": "<file_from_search>",
  "symbolName": "<symbol_at_top_of_file>",
  "lineHint": 1,
  "contextLines": 20
}
```

**Expected:**
- [ ] No error when context would go before line 1
- [ ] Context starts at line 1 (no negative lines)
- [ ] Available context returned without padding

---

### TC-13: Symbol Name Max Length (Boundary)

**Goal:** Verify `symbolName` at maximum length (255 chars) is handled.

```json
{
  "uri": "<known_file>",
  "symbolName": "<255_char_string>",
  "lineHint": 1,
  "contextLines": 5
}
```

**Expected:**
- [ ] No crash or timeout
- [ ] "Symbol not found" expected (no such long symbol)
- [ ] Handles gracefully without validation error

---

### TC-14: lineHint Beyond File Length

**Goal:** Verify behavior when `lineHint` exceeds the file's total lines.

```json
{
  "uri": "<known_file>",
  "symbolName": "<known_symbol>",
  "lineHint": 99999,
  "contextLines": 5
}
```

**Expected:**
- [ ] "Symbol not found" or graceful error
- [ ] No crash or timeout
- [ ] Search radius may not cover actual definition location

---

### TC-15: Imported Symbol (Cross-File Definition)

**Goal:** Verify navigation to an imported symbol resolves to its source file.

**Step 1 — Search for an import:**
```json
localSearchCode: {
  "pattern": "import.*ToolError",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Goto definition:**
```json
{
  "uri": "<file_with_import>",
  "symbolName": "ToolError",
  "lineHint": "<line_of_import>",
  "contextLines": 5
}
```

**Expected:**
- [ ] Navigates to the actual source definition (not the import line)
- [ ] Different file than the import file
- [ ] Source definition fully visible with context

---

### TC-16: Variable/Constant Definition

**Goal:** Verify navigation to a `const` or `let` variable definition.

**Step 1 — Search:**
```json
localSearchCode: {
  "pattern": "const MAX_RETRIES",
  "path": "<WORKSPACE_ROOT>",
  "mode": "paginated",
  "matchesPerPage": 1
}
```

**Step 2 — Goto definition:**
```json
{
  "uri": "<file_from_step1>",
  "symbolName": "MAX_RETRIES",
  "lineHint": "<line_from_step1>",
  "contextLines": 5
}
```

**Expected:**
- [ ] Navigates to the const/variable declaration
- [ ] Variable value visible in context
- [ ] Works for both `const` and `let` declarations

---

### TC-17: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"uri": "<valid_file>", "symbolName": "<valid_symbol>", "lineHint": "<valid_line>", "contextLines": 5},
    {"uri": "/nonexistent/file.ts", "symbolName": "test", "lineHint": 1, "contextLines": 5},
    {"uri": "<valid_file>", "symbolName": "NONEXISTENT_XYZ", "lineHint": 1, "contextLines": 5}
  ]
}
```

**Expected:**
- [ ] First query succeeds with definition
- [ ] Second query returns file not found error
- [ ] Third query returns symbol not found error
- [ ] Each result isolated per query
- [ ] No cascade failure

---

## Validation Checklist

| # | Test Case | Status |
|---|-----------|--------|
| 1 | Standard definition lookup | |
| 2 | contextLines = 0 | |
| 3 | contextLines = 10 | |
| 4 | Function definition | |
| 5 | orderHint re-exports (known bug) | |
| 6 | Type/interface definition | |
| 7 | Symbol not at hint line | |
| 8 | Non-existent symbol (error) | |
| 9 | Non-existent file (error) | |
| 10 | Context lines max (boundary) | |
| 11 | lineHint below minimum (validation) | |
| 12 | Context lines beyond file boundary | |
| 13 | Symbol name max length (boundary) | |
| 14 | lineHint beyond file length | |
| 15 | Imported symbol (cross-file definition) | |
| 16 | Variable/constant definition | |
| 17 | Bulk queries (error isolation) | |

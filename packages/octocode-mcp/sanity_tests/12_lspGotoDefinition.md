# Sanity Test: `lspGotoDefinition`


---

## Tool Overview

Navigates to the definition of a symbol using Language Server Protocol. Requires `lineHint` from a prior `localSearchCode` call. Supports `contextLines` to control surrounding code and `orderHint` for disambiguation. Known issue: `orderHint` fails on re-exports.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning`
2. **Pagination/Limits** - Test `contextLines` parameter and response size management
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Queries Validation Template
```json
{
  "queries": [{
    "uri": "<file_path>",
    "symbolName": "symbol_name",
    "lineHint": 123,
    "mainResearchGoal": "High-level research objective",
    "researchGoal": "Specific goal for this definition lookup",
    "reasoning": "Why this approach helps reach the goal",
    // ... other parameters
  }]
}
```

### Hints Validation Checklist
- [ ] Response includes helpful hints for symbol analysis
- [ ] Hints suggest next logical steps (e.g., find references, call hierarchy)
- [ ] Context navigation suggestions
- [ ] Symbol relationship insights in hints

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
  "queries": [{
    "pattern": "class GithubClient",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find symbol for definition lookup",
    "researchGoal": "Locate GithubClient class reference",
    "reasoning": "Need lineHint for LSP goto definition call"
  }]
}
```

**Step 2 — Goto definition:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "GithubClient",
    "lineHint": "<line_from_step1>",
    "contextLines": 5,
    "mainResearchGoal": "Navigate to symbol definition",
    "researchGoal": "Find GithubClient class definition with context",
    "reasoning": "Definition lookup provides implementation details and class structure"
  }]
}
```

**Expected:**
- [ ] Navigates to class definition
- [ ] 5 lines of context before and after
- [ ] `resolvedPosition` shows exact character position
- [ ] Definition range clearly marked
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints for symbol analysis
  - [ ] Hints suggest next steps (find references, call hierarchy)
  - [ ] Context navigation suggestions

---

### TC-2: Context Lines = 0

**Goal:** Verify `contextLines: 0` returns only the definition range.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "GithubClient",
    "lineHint": "<line_from_search>",
    "contextLines": 0,
    "mainResearchGoal": "Test minimal context output",
    "researchGoal": "Verify contextLines=0 returns only definition range",
    "reasoning": "Minimal context reduces response size for focused analysis"
  }]
}
```

**Expected:**
- [ ] Only the definition range returned (no surrounding context)
- [ ] `displayRange` shows exact definition lines
- [ ] Much smaller output than with context
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints for symbol analysis
  - [ ] Hints suggest next steps (find references, call hierarchy)

---

### TC-3: Context Lines = 10

**Goal:** Verify `contextLines: 10` provides extended context.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "GithubClient",
    "lineHint": "<line_from_search>",
    "contextLines": 10,
    "mainResearchGoal": "Test extended context output",
    "researchGoal": "Verify contextLines=10 provides full class context",
    "reasoning": "Extended context shows full implementation and dependencies"
  }]
}
```

**Expected:**
- [ ] 10 lines before and after definition
- [ ] Full class body visible (for short classes)
- [ ] Numbered lines in output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps relevant to the query
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints for symbol analysis
  - [ ] Hints suggest next steps (find references, call hierarchy)

---

### TC-4: Function Definition

**Goal:** Verify navigation to a function definition.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "function fetchWithRetries",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find function for definition lookup",
    "researchGoal": "Locate fetchWithRetries function reference",
    "reasoning": "Need lineHint for LSP goto definition call"
  }]
}
```

**Step 2 — Goto definition:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "fetchWithRetries",
    "lineHint": "<line_from_step1>",
    "contextLines": 5,
    "mainResearchGoal": "Navigate to function definition",
    "researchGoal": "Find fetchWithRetries function definition with context",
    "reasoning": "Definition lookup provides implementation details and function signature"
  }]
}
```

**Expected:**
- [ ] Navigates to function definition
- [ ] Function signature visible
- [ ] `searchRadius` info present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-5: orderHint for Re-exports + Cross-File Navigation

**Goal:** Verify re-export following, `orderHint` semantics, and cross-file definition resolution from imports.

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
- [ ] Resolves to a **different file** than the import file (cross-file navigation)
- [ ] Source definition fully visible with context

---

### TC-6: Type/Interface Definition

**Goal:** Verify navigation to a TypeScript type or interface.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "interface.*Query",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find interface for definition lookup",
    "researchGoal": "Locate interface reference",
    "reasoning": "Need lineHint for LSP goto definition call"
  }]
}
```

**Step 2 — Goto definition:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "<InterfaceName>",
    "lineHint": "<line_from_step1>",
    "contextLines": 5,
    "mainResearchGoal": "Navigate to interface/type definition",
    "researchGoal": "Find interface definition with context",
    "reasoning": "Definition lookup provides type structure and field details"
  }]
}
```

**Expected:**
- [ ] Navigates to interface/type definition
- [ ] Full interface body visible with context
- [ ] `symbolKind` or similar metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-7: Symbol Not at Hint Line

**Goal:** Verify behavior when `lineHint` is approximate (not exact).

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "<known_symbol>",
    "lineHint": "<line_hint_off_by_5>",
    "contextLines": 5,
    "mainResearchGoal": "Test approximate lineHint behavior",
    "researchGoal": "Verify searchRadius when lineHint is approximate",
    "reasoning": "LSP may resolve if within search radius"
  }]
}
```

**Expected:**
- [ ] Still resolves if within `searchRadius`
- [ ] `searchRadius` shown in response
- [ ] May fail if too far from actual definition
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps relevant to the query
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints (symbol verification, lineHint validation)

---

### TC-8: Non-Existent Symbol (Error)

**Goal:** Verify graceful handling when symbol doesn't exist at lineHint.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "NONEXISTENT_SYMBOL_XYZ_99999",
    "lineHint": 1,
    "contextLines": 5,
    "mainResearchGoal": "Test error handling for non-existent symbol",
    "researchGoal": "Verify graceful failure when symbol not found",
    "reasoning": "Error responses should include recovery hints"
  }]
}
```

**Expected:**
- [ ] "Symbol not found" or equivalent error
- [ ] No crash or timeout
- [ ] `searchRadius` info may show search area
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints present (error hints)
  - [ ] Hints suggest recovery (symbol verification, alternative search)

---

### TC-9: Non-Existent File (Error)

**Goal:** Verify graceful handling when file doesn't exist.

```json
{
  "queries": [{
    "uri": "/nonexistent/path/to/file.ts",
    "symbolName": "test",
    "lineHint": 1,
    "contextLines": 5,
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

---

### TC-10: Context Lines Max (Boundary)

**Goal:** Verify `contextLines: 20` (maximum) works correctly.

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<symbol>",
    "lineHint": "<line>",
    "contextLines": 20,
    "mainResearchGoal": "Test contextLines maximum boundary",
    "researchGoal": "Verify contextLines:20 works without errors",
    "reasoning": "Maximum value should not cause crashes or timeouts"
  }]
}
```

**Expected:**
- [ ] Up to 20 lines context before and after
- [ ] No error at maximum value
- [ ] Large but manageable output
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-11: lineHint = 0 Below Minimum (Validation)

**Goal:** Verify `lineHint` below minimum (1) is rejected.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "test",
    "lineHint": 0,
    "contextLines": 5,
    "mainResearchGoal": "Test lineHint validation",
    "researchGoal": "Verify lineHint min=1 is enforced",
    "reasoning": "Validation should reject invalid lineHint"
  }]
}
```

**Expected:**
- [ ] Validation error (lineHint min is 1)
- [ ] Clear error message
- [ ] No crash
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints present for validation errors
  - [ ] Hints suggest lineHint validation (use 1-indexed line numbers)
- [ ] **Hints Validation:**
  - [ ] Hints suggest lineHint must be >= 1

---

### TC-12: Context Lines Beyond File Boundary

**Goal:** Verify `contextLines` gracefully handles file edge (beginning/end).

```json
{
  "queries": [{
    "uri": "<file_from_search>",
    "symbolName": "<symbol_at_top_of_file>",
    "lineHint": 1,
    "contextLines": 20,
    "mainResearchGoal": "Test context at file boundary",
    "researchGoal": "Verify contextLines handles file edges",
    "reasoning": "Context should not extend before line 1"
  }]
}
```

**Expected:**
- [ ] No error when context would go before line 1
- [ ] Context starts at line 1 (no negative lines)
- [ ] Available context returned without padding
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints for symbol analysis

---

### TC-13: Symbol Name Max Length (Boundary)

**Goal:** Verify `symbolName` at maximum length (255 chars) is handled.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "<255_char_string>",
    "lineHint": 1,
    "contextLines": 5,
    "mainResearchGoal": "Test symbolName max length boundary",
    "researchGoal": "Verify 255-char symbolName is handled",
    "reasoning": "Boundary values should not cause crashes"
  }]
}
```

**Expected:**
- [ ] No crash or timeout
- [ ] "Symbol not found" expected (no such long symbol)
- [ ] Handles gracefully without validation error
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints (symbol verification)

---

### TC-14: lineHint Beyond File Length

**Goal:** Verify behavior when `lineHint` exceeds the file's total lines.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "<known_symbol>",
    "lineHint": 99999,
    "contextLines": 5,
    "mainResearchGoal": "Test lineHint beyond file length",
    "researchGoal": "Verify graceful handling when lineHint exceeds file",
    "reasoning": "Out-of-range lineHint should not crash"
  }]
}
```

**Expected:**
- [ ] "Symbol not found" or graceful error
- [ ] No crash or timeout
- [ ] Search radius may not cover actual definition location
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable recovery steps
- [ ] **Hints Validation:**
  - [ ] Hints suggest lineHint validation, alternative search

---

### TC-15: Variable/Constant Definition

**Goal:** Verify navigation to a `const` or `let` variable definition.

**Step 1 — Search:**
```json
localSearchCode: {
  "queries": [{
    "pattern": "const MAX_RETRIES",
    "path": "<WORKSPACE_ROOT>",
    "mode": "paginated",
    "matchesPerPage": 1,
    "mainResearchGoal": "Find constant for definition lookup",
    "researchGoal": "Locate MAX_RETRIES constant reference",
    "reasoning": "Need lineHint for LSP goto definition call"
  }]
}
```

**Step 2 — Goto definition:**
```json
{
  "queries": [{
    "uri": "<file_from_step1>",
    "symbolName": "MAX_RETRIES",
    "lineHint": "<line_from_step1>",
    "contextLines": 5,
    "mainResearchGoal": "Navigate to variable/constant definition",
    "researchGoal": "Find MAX_RETRIES declaration with context",
    "reasoning": "Definition lookup provides variable value"
  }]
}
```

**Expected:**
- [ ] Navigates to the const/variable declaration
- [ ] Variable value visible in context
- [ ] Works for both `const` and `let` declarations
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present
  - [ ] Hints suggest actionable next steps (find references)
- [ ] **Hints Validation:**
  - [ ] Response includes helpful hints for symbol analysis

---

### TC-16: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"uri": "<valid_file>", "symbolName": "<valid_symbol>", "lineHint": "<valid_line>", "contextLines": 5, "mainResearchGoal": "Bulk test valid query", "researchGoal": "First query should succeed", "reasoning": "Error isolation test"},
    {"uri": "/nonexistent/file.ts", "symbolName": "test", "lineHint": 1, "contextLines": 5, "mainResearchGoal": "Bulk test file error", "researchGoal": "Second query should fail", "reasoning": "Error isolation test"},
    {"uri": "<valid_file>", "symbolName": "NONEXISTENT_XYZ", "lineHint": 1, "contextLines": 5, "mainResearchGoal": "Bulk test symbol error", "researchGoal": "Third query should fail", "reasoning": "Error isolation test"}
  ]
}
```

**Expected:**
- [ ] First query succeeds with definition
- [ ] Second query returns file not found error
- [ ] Third query returns symbol not found error
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints present for each result (success + error hints)
  - [ ] Hints suggest actionable next steps per status
- [ ] **Hints Validation:**
  - [ ] Success hints for first query; error recovery hints for second and third

---

## Schema Edge Cases & Boundary Tests

**Schema reference (input):** `queries` length **1–5**. Per query: `uri` **minLength 1**; `symbolName` **1–255**; `lineHint` **≥ 1**; `contextLines` **0–20**.

**LSP tools (contract):** each query uses **`researchGoal`** and **`reasoning`** only — **do not** send **`mainResearchGoal`** (not in the LSP tool schema). Examples below follow that contract.

### SE-1: Empty `queries` array

**Goal:** Reject bulk payload with zero queries.

```json
{
  "queries": []
}
```

**Expected:**
- [ ] Validation or tool error — empty `queries` not allowed
- [ ] **Response Validation:** bulk error shape if applicable

### SE-2: `queries` over maximum (6 entries, max 5)

**Goal:** Enforce at most **5** queries per request.

```json
{
  "queries": [
    {"id": "1", "uri": "<file>", "symbolName": "a", "lineHint": 1, "researchGoal": "e1", "reasoning": "edge"},
    {"id": "2", "uri": "<file>", "symbolName": "b", "lineHint": 1, "researchGoal": "e2", "reasoning": "edge"},
    {"id": "3", "uri": "<file>", "symbolName": "c", "lineHint": 1, "researchGoal": "e3", "reasoning": "edge"},
    {"id": "4", "uri": "<file>", "symbolName": "d", "lineHint": 1, "researchGoal": "e4", "reasoning": "edge"},
    {"id": "5", "uri": "<file>", "symbolName": "e", "lineHint": 1, "researchGoal": "e5", "reasoning": "edge"},
    {"id": "6", "uri": "<file>", "symbolName": "f", "lineHint": 1, "researchGoal": "e6", "reasoning": "edge"}
  ]
}
```

**Expected:**
- [ ] Validation error (too many queries)
- [ ] Message or hints reference maximum **5**

### SE-3: `lineHint` 0 (below minimum 1)

**Goal:** Reject non–1-based line hint.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "test",
    "lineHint": 0,
    "contextLines": 5,
    "researchGoal": "lineHint min",
    "reasoning": "Must be >= 1"
  }]
}
```

**Expected:**
- [ ] Validation error for `lineHint`
- [ ] **Hints Validation:** hints mention 1-indexed / minimum **1** if provided

### SE-4: `contextLines` 21 (above maximum 20)

**Goal:** Reject `contextLines` above **20**.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "test",
    "lineHint": 1,
    "contextLines": 21,
    "researchGoal": "contextLines max",
    "reasoning": "Above 20"
  }]
}
```

**Expected:**
- [ ] Validation error for `contextLines`
- [ ] Allowed range **0–20** reflected in error or hints

### SE-5: Empty `symbolName` (`minLength` 1)

**Goal:** Reject empty symbol name.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "",
    "lineHint": 1,
    "contextLines": 5,
    "researchGoal": "empty symbolName",
    "reasoning": "minLength 1"
  }]
}
```

**Expected:**
- [ ] Validation error; no LSP round-trip
- [ ] **Response Validation:** per-query error status if bulk shape applies

### SE-6: `symbolName` 256 characters (above maximum 255)

**Goal:** Reject or truncate at boundary — **256** chars must fail schema.

```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "<256_char_string>",
    "lineHint": 1,
    "contextLines": 5,
    "researchGoal": "symbolName max+1",
    "reasoning": "255 max"
  }]
}
```

**Expected:**
- [ ] Validation error (preferred) **or** document server behavior if it differs
- [ ] No silent acceptance of overlong `symbolName`

### SE-7: Missing required fields (`uri` / `symbolName` / `lineHint`)

**Goal:** Each required field is enforced.

**Missing `uri`:**
```json
{
  "queries": [{
    "symbolName": "x",
    "lineHint": 1,
    "researchGoal": "missing uri",
    "reasoning": "required"
  }]
}
```

**Missing `symbolName`:**
```json
{
  "queries": [{
    "uri": "<known_file>",
    "lineHint": 1,
    "researchGoal": "missing symbolName",
    "reasoning": "required"
  }]
}
```

**Missing `lineHint`:**
```json
{
  "queries": [{
    "uri": "<known_file>",
    "symbolName": "x",
    "researchGoal": "missing lineHint",
    "reasoning": "required"
  }]
}
```

**Expected:**
- [ ] Each omission fails validation with a clear missing-field message
- [ ] No LSP request sent for invalid payloads

### SE-8: Response-level pagination

**Goal:** If the tool returns chunked or paginated definition output, metadata and hints stay consistent.

**Expected:**
- [ ] **Response Validation:** `instructions` / continuation fields match returned content
- [ ] **Hints Validation:** next-step hints when more content is available

### SE-9: Duplicate query `id` values

**Goal:** Duplicate `id` in one request is rejected or handled deterministically.

```json
{
  "queries": [
    {"id": "dup", "uri": "<file>", "symbolName": "a", "lineHint": 1, "researchGoal": "a", "reasoning": "edge"},
    {"id": "dup", "uri": "<file>", "symbolName": "b", "lineHint": 1, "researchGoal": "b", "reasoning": "edge"}
  ]
}
```

**Expected:**
- [ ] Validation error **or** documented dedup behavior
- [ ] **Response Validation:** `results[].id` aligns with accepted queries when duplicates rejected

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning`
- [ ] **Context lines tests** verify `contextLines` parameter controls response size
- [ ] **Hints validation** checks for helpful guidance in all responses
- [ ] **Response validation** — every Expected section includes explicit response checking

### Test Cases Status

| # | Test Case | Queries | Context | Hints | Response Validation | Status |
|---|-----------|---------|---------|-------|----------------------|--------|
| 1 | Standard definition lookup | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | contextLines = 0 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | contextLines = 10 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Function definition | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | orderHint re-exports + cross-file navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Type/interface definition | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | Symbol not at hint line | ✅ | - | ✅ | ✅ | ✅ |
| 8 | Non-existent symbol (error) | ✅ | - | ✅ | ✅ | ✅ |
| 9 | Non-existent file (error) | ✅ | - | ✅ | ✅ | ✅ |
| 10 | Context lines max (boundary) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 | lineHint below minimum (validation) | ✅ | - | ✅ | ✅ | ✅ |
| 12 | Context lines beyond file boundary | ✅ | ✅ | ✅ | ✅ | ✅ |
| 13 | Symbol name max length (boundary) | ✅ | - | ✅ | ✅ | ✅ |
| 14 | lineHint beyond file length | ✅ | - | ✅ | ✅ | ✅ |
| 15 | Variable/constant definition | ✅ | ✅ | ✅ | ✅ | ✅ |
| 16 | Bulk queries (error isolation) | ✅ | - | ✅ | ✅ | ✅ |

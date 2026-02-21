# Sanity Test: `githubViewRepoStructure`

---

## Tool Overview

Displays the file/directory structure of a GitHub repository. Supports depth control, pagination, branch selection, and path scoping. Auto-filters noisy directories (`.git`, `node_modules`, `dist`).

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning` (wrap bulk in `{ "queries": [{ ... }] }`)
2. **Pagination/Limits** - Test `entriesPerPage`, `entryPageNumber` parameters for result management
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Hints Validation Checklist
- [ ] Response includes helpful hints for structure exploration
- [ ] Hints suggest file reading, code search, or deeper directory exploration
- [ ] Pagination hints when results are truncated
- [ ] Status-specific hints present

---

## Test Cases

### TC-1: Root Structure (Depth 1)

**Goal:** Verify `depth: 1` shows top-level structure.

```json
{
  "mainResearchGoal": "Understand octocode-mcp repo layout",
  "researchGoal": "View root structure",
  "reasoning": "Start with root to understand overall layout",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "",
  "depth": 1
}
```

**Expected:**
- [ ] Top-level files and directories shown
- [ ] `packages/`, `docs/`, `skills/` visible
- [ ] `totalFiles` and `totalFolders` counts present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-2: Nested Structure (Depth 2)

**Goal:** Verify `depth: 2` shows subdirectory contents.

```json
{
  "mainResearchGoal": "Explore packages directory",
  "researchGoal": "View nested structure",
  "reasoning": "Depth 2 reveals package contents",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages",
  "depth": 2
}
```

**Expected:**
- [ ] Each subdirectory's immediate children visible
- [ ] Files shown per subfolder
- [ ] Structured output organized by directory
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-3: Large Page Size

**Goal:** Verify `entriesPerPage: 30` works for larger pages.

```json
{
  "mainResearchGoal": "View more entries at once",
  "researchGoal": "Test larger page size",
  "reasoning": "Larger pages reduce pagination overhead",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages/octocode-mcp/src",
  "depth": 2,
  "entriesPerPage": 30
}
```

**Expected:**
- [ ] Up to 30 entries returned
- [ ] All entries valid files/directories
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-4: Small Page Size

**Goal:** Verify `entriesPerPage: 5` with pagination.

```json
{
  "mainResearchGoal": "Test pagination with small pages",
  "researchGoal": "Verify small page pagination",
  "reasoning": "Small pages test pagination mechanics",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "",
  "depth": 1,
  "entriesPerPage": 5
}
```

**Expected:**
- [ ] Max 5 entries returned
- [ ] `summary.truncated` may be true if more exist
- [ ] Pagination metadata present
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-5: Page 2 Navigation

**Goal:** Verify `entryPageNumber: 2` shows different entries.

```json
{
  "mainResearchGoal": "Navigate to page 2",
  "researchGoal": "Test page navigation",
  "reasoning": "Page 2 should show next batch of entries",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "",
  "depth": 1,
  "entriesPerPage": 5,
  "entryPageNumber": 2
}
```

**Expected:**
- [ ] Different entries than page 1
- [ ] No overlap with TC-4 results
- [ ] Page metadata shows current page
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-6: Explicit Branch

**Goal:** Verify `branch` parameter selects correct branch.

```json
{
  "mainResearchGoal": "View main branch structure",
  "researchGoal": "Verify branch selection",
  "reasoning": "Branch parameter should target specific branch",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "",
  "depth": 1
}
```

**Expected:**
- [ ] Structure from `main` branch
- [ ] Branch info in response metadata
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-7: Subdirectory Path Scoping

**Goal:** Verify `path` scopes to a specific subdirectory.

```json
{
  "mainResearchGoal": "Explore tools directory",
  "researchGoal": "View specific subdirectory",
  "reasoning": "Path scoping focuses on relevant directory",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages/octocode-mcp/src/tools",
  "depth": 1
}
```

**Expected:**
- [ ] Only contents of `src/tools/` shown
- [ ] Tool subdirectories visible (e.g., `github_search_code/`, `lsp_call_hierarchy/`)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-8: Non-Existent Repo (Error)

**Goal:** Verify graceful handling of invalid repository.

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "Non-existent repository",
  "reasoning": "Tool should handle missing repos gracefully",
  "owner": "bgauryy",
  "repo": "this-repo-does-not-exist-xyz-99999",
  "branch": "main",
  "path": "",
  "depth": 1
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication repo not found
- [ ] No stack trace leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-9: Non-Existent Branch (Error)

**Goal:** Verify graceful handling of invalid branch.

```json
{
  "mainResearchGoal": "Test branch error handling",
  "researchGoal": "Non-existent branch",
  "reasoning": "Tool should handle missing branches gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "nonexistent-branch-xyz-99999",
  "path": "",
  "depth": 1
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

### TC-10: Non-Existent Path (Error)

**Goal:** Verify graceful handling of invalid path within repo.

```json
{
  "mainResearchGoal": "Test path error handling",
  "researchGoal": "Non-existent directory path",
  "reasoning": "Tool should handle missing paths gracefully",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "nonexistent/directory/path",
  "depth": 1
}
```

**Expected:**
- [ ] Error or empty results
- [ ] No crash
- [ ] Clear indication path doesn't exist
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-11: Max Entries Per Page (Boundary)

**Goal:** Verify `entriesPerPage: 200` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test boundary values",
  "researchGoal": "Max page size",
  "reasoning": "Max entriesPerPage should not cause issues",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages/octocode-mcp/src",
  "depth": 2,
  "entriesPerPage": 200
}
```

**Expected:**
- [ ] Up to 200 entries returned
- [ ] No timeout or error
- [ ] All entries valid
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-12: Page Beyond Available (Boundary)

**Goal:** Verify behavior when requesting page beyond available entries.

```json
{
  "mainResearchGoal": "Test pagination boundary",
  "researchGoal": "Page beyond available",
  "reasoning": "Edge case for pagination handling",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "",
  "depth": 1,
  "entriesPerPage": 5,
  "entryPageNumber": 999
}
```

**Expected:**
- [ ] Empty results or clear "no more pages" indication
- [ ] No error thrown
- [ ] Pagination metadata reflects actual total
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-13: Entries Per Page Minimum (Boundary)

**Goal:** Verify `entriesPerPage: 1` (minimum) returns exactly one entry.

```json
{
  "mainResearchGoal": "Test minimum page size",
  "researchGoal": "Single entry per page",
  "reasoning": "Minimum entriesPerPage boundary test",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "",
  "depth": 1,
  "entriesPerPage": 1
}
```

**Expected:**
- [ ] Exactly 1 entry returned
- [ ] Pagination shows many more pages available
- [ ] Can navigate entry-by-entry
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-14: Path With Trailing Slash

**Goal:** Verify trailing slash in path is handled gracefully.

```json
{
  "mainResearchGoal": "Test path edge case",
  "researchGoal": "Trailing slash handling",
  "reasoning": "Users may include trailing slash",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages/",
  "depth": 1
}
```

**Expected:**
- [ ] Same results as `path: "packages"` without trailing slash
- [ ] No error
- [ ] Content of packages/ directory shown
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-15: Deeply Nested Path

**Goal:** Verify very long nested path works correctly.

```json
{
  "mainResearchGoal": "Test deep path",
  "researchGoal": "Deeply nested directory",
  "reasoning": "Deep paths should resolve correctly",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages/octocode-mcp/src/tools/local_ripgrep",
  "depth": 1
}
```

**Expected:**
- [ ] Contents of the deeply nested directory shown
- [ ] Files like `execution.ts`, `scheme.ts`, `types.ts` visible
- [ ] No path resolution errors
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-16: Depth 2 on Large Directory (Performance)

**Goal:** Verify `depth: 2` on a large directory doesn't timeout.

```json
{
  "mainResearchGoal": "Test performance",
  "researchGoal": "Large directory with depth 2",
  "reasoning": "Depth 2 on large dirs can be slow — verify no timeout",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "branch": "main",
  "path": "packages/octocode-mcp/src",
  "depth": 2,
  "entriesPerPage": 50
}
```

**Expected:**
- [ ] Response succeeds within reasonable time
- [ ] No timeout error
- [ ] Nested file listing is correct and organized
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-17: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid", "reasoning": "Test", "owner": "bgauryy", "repo": "octocode-mcp", "branch": "main", "path": "", "depth": 1, "entriesPerPage": 5},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Invalid repo", "reasoning": "Test", "owner": "bgauryy", "repo": "nonexistent-xyz-99999", "branch": "main", "path": "", "depth": 1},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Invalid branch", "reasoning": "Test", "owner": "bgauryy", "repo": "octocode-mcp", "branch": "nonexistent-branch", "path": "", "depth": 1}
  ]
}
```

**Expected:**
- [ ] First query succeeds with structure
- [ ] Second and third queries return errors
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-18: Pagination Test (entriesPerPage + entryPageNumber)

**Goal:** Verify `entriesPerPage` and `entryPageNumber` parameters control result pagination together.

```json
{
  "queries": [{
    "mainResearchGoal": "Test pagination functionality",
    "researchGoal": "Verify entriesPerPage and entryPageNumber work correctly",
    "reasoning": "Pagination is essential for browsing large directory structures",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "branch": "main",
    "path": "",
    "depth": 1,
    "entriesPerPage": 5,
    "entryPageNumber": 2
  }]
}
```

**Expected:**
- [ ] Max 5 entries returned from page 2
- [ ] Different entries than page 1
- [ ] Pagination metadata shows current page and total
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
- [ ] **Pagination tests** verify `entriesPerPage`, `entryPageNumber` parameters for result management
- [ ] **Hints validation** checks for helpful guidance in all responses

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Root depth 1 | ✅ | - | ✅ | |
| 2 | Nested depth 2 | ✅ | - | ✅ | |
| 3 | Large page size | ✅ | ✅ | ✅ | |
| 4 | Small page size | ✅ | ✅ | ✅ | |
| 5 | Page 2 navigation | ✅ | ✅ | ✅ | |
| 6 | Explicit branch | ✅ | - | ✅ | |
| 7 | Subdirectory scoping | ✅ | - | ✅ | |
| 8 | Non-existent repo (error) | ✅ | - | ✅ | |
| 9 | Non-existent branch (error) | ✅ | - | ✅ | |
| 10 | Non-existent path (error) | ✅ | - | ✅ | |
| 11 | Max entries per page (boundary) | ✅ | ✅ | ✅ | |
| 12 | Page beyond available (boundary) | ✅ | ✅ | ✅ | |
| 13 | Entries per page minimum (boundary) | ✅ | ✅ | ✅ | |
| 14 | Path with trailing slash | ✅ | - | ✅ | |
| 15 | Deeply nested path | ✅ | - | ✅ | |
| 16 | Depth 2 on large directory (performance) | ✅ | - | ✅ | |
| 17 | Bulk queries (error isolation) | ✅ | - | ✅ | |
| 18 | Pagination test (entriesPerPage + entryPageNumber) | ✅ | ✅ | ✅ | |

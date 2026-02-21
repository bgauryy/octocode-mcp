# Sanity Test: `githubSearchCode`

---

## Tool Overview

Searches code across GitHub repositories. Supports two match modes (`file` for content matching with snippets, `path` for file path matching), plus filtering by extension, filename, path prefix, and owner/repo scoping.

## Enhanced Testing Requirements

**ALL test cases must validate:**
1. **Queries Structure** - Every query includes `mainResearchGoal`, `researchGoal`, and `reasoning` ✅ (Already implemented)
2. **Pagination/Limits** - Test `limit`, `page` parameters for result management
3. **Hints Validation** - **GOLDEN**: Check response hints for user guidance and next steps

### Hints Validation Checklist
- [ ] Response includes helpful hints for code analysis
- [ ] Hints suggest next logical steps (e.g., file reading, repo exploration)
- [ ] Pagination hints when results are truncated
- [ ] Repository context and search refinement suggestions

---

## Test Cases

### TC-1: Path Match Mode

**Goal:** Verify `match: "path"` finds files by path pattern without content matching.

```json
{
  "queries": [{
    "mainResearchGoal": "Find utility files in octocode-mcp",
    "researchGoal": "Search by file path",
    "reasoning": "Path mode is useful for file discovery",
    "keywordsToSearch": ["utils"],
    "match": "path",
    "owner": "bgauryy",
    "repo": "octocode-mcp"
  }]
}
```

**Expected:**
- [ ] Files with "utils" in their path returned
- [ ] No `text_matches` in results (by design for path mode)
- [ ] `repositoryContext` includes owner/repo/branch
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-2: File Match Mode

**Goal:** Verify `match: "file"` returns code snippets with text matches.

```json
{
  "queries": [{
    "mainResearchGoal": "Find registerTool usage",
    "researchGoal": "Search file content",
    "reasoning": "File mode provides code snippets for review",
    "keywordsToSearch": ["registerTool"],
    "match": "file",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "limit": 5
  }]
}
```

**Expected:**
- [ ] `text_matches` present with code snippets
- [ ] Snippets show actual code around matches
- [ ] `repositoryContext` populated
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with `text_matches` structure (fragment, object_url)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest file reading and repo exploration

---

### TC-3: Extension Filter

**Goal:** Verify `extension` limits to specific file types.

```json
{
  "queries": [{
    "mainResearchGoal": "Find TypeScript code",
    "researchGoal": "Filter by extension",
    "reasoning": "Extension filtering narrows to specific language files",
    "keywordsToSearch": ["export function"],
    "extension": "ts",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "limit": 5
  }]
}
```

**Expected:**
- [ ] Only `.ts` files in results
- [ ] No `.js`, `.json`, `.md` files
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with `text_matches` structure (fragment, object_url)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest file reading and repo exploration

---

### TC-4: Filename Filter

**Goal:** Verify `filename` matches specific file names.

```json
{
  "queries": [{
    "mainResearchGoal": "Find execution files",
    "researchGoal": "Search by filename",
    "reasoning": "Filename filter narrows to specific files",
    "keywordsToSearch": ["export"],
    "filename": "execution",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "limit": 5
  }]
}
```

**Expected:**
- [ ] Only files named "execution" (e.g., `execution.ts`)
- [ ] Results from different tool directories
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with `text_matches` structure (fragment, object_url)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest file reading and repo exploration

---

### TC-5: Multi-Keyword Search

**Goal:** Verify multiple keywords combined in search.

```json
{
  "queries": [{
    "mainResearchGoal": "Find tool registration code",
    "researchGoal": "Combined keyword search",
    "reasoning": "Multiple keywords narrow results",
    "keywordsToSearch": ["registerTool", "server"],
    "match": "file",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "limit": 5
  }]
}
```

**Expected:**
- [ ] Results contain both keywords
- [ ] Smaller result set than single keyword
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with `text_matches` structure (fragment, object_url)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest file reading and repo exploration

---

### TC-6: Path Prefix Filter

**Goal:** Verify `path` limits search to a directory prefix.

```json
{
  "mainResearchGoal": "Find code in tools directory",
  "researchGoal": "Search with path filter",
  "reasoning": "Path prefix scopes search to subdirectory",
  "keywordsToSearch": ["export"],
  "path": "packages/octocode-mcp/src/tools",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 5
}
```

**Expected:**
- [ ] Only files under `packages/octocode-mcp/src/tools/`
- [ ] No files from other directories
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-7: Limit Results

**Goal:** Verify `limit` caps returned results.

```json
{
  "mainResearchGoal": "Test limit parameter",
  "researchGoal": "Verify limit works",
  "reasoning": "Limit controls result count",
  "keywordsToSearch": ["import"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 3
}
```

**Expected:**
- [ ] Exactly 3 results returned
- [ ] Pagination total may show more available
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-8: Pagination Total Matches

**Goal:** Verify `pagination.totalMatches` returns proper counts.

```json
{
  "mainResearchGoal": "Verify pagination metadata",
  "researchGoal": "Check totalMatches accuracy",
  "reasoning": "totalMatches was previously broken (always 0)",
  "keywordsToSearch": ["export"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 3
}
```

**Expected:**
- [ ] `pagination.totalMatches` > 0
- [ ] Count reflects actual number of matching files
- [ ] Not 0 (previously known bug, now fixed)
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-9: Cross-Repo Search (No Owner/Repo)

**Goal:** Verify search works without owner/repo scoping.

```json
{
  "mainResearchGoal": "Find MCP tool patterns globally",
  "researchGoal": "Unscoped code search",
  "reasoning": "Global search for discovering patterns across repos",
  "keywordsToSearch": ["MCP tool registration"],
  "match": "file",
  "limit": 5
}
```

**Expected:**
- [ ] Results from multiple repositories
- [ ] `repositoryContext` varies across results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-10: Page Navigation

**Goal:** Verify `page` parameter for result pagination.

```json
{
  "mainResearchGoal": "Navigate code search results",
  "researchGoal": "Test page 2",
  "reasoning": "Page parameter enables browsing additional results",
  "keywordsToSearch": ["import"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 5,
  "page": 2
}
```

**Expected:**
- [ ] Different results than page 1
- [ ] No overlap with first page results
- [ ] Pagination metadata shows current page
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-11: Non-Existent Repo (Error)

**Goal:** Verify graceful handling of invalid repository.

```json
{
  "mainResearchGoal": "Test error handling",
  "researchGoal": "Non-existent repository",
  "reasoning": "Tool should handle missing repos gracefully",
  "keywordsToSearch": ["test"],
  "owner": "bgauryy",
  "repo": "this-repo-does-not-exist-xyz-99999",
  "limit": 3
}
```

**Expected:**
- [ ] Error message returned (not a crash)
- [ ] Clear indication repo not found
- [ ] No stack trace or internal details leaked
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-12: Empty Results

**Goal:** Verify clean handling when no code matches.

```json
{
  "mainResearchGoal": "Test empty results",
  "researchGoal": "Query with no matches",
  "reasoning": "Tool should handle zero results gracefully",
  "keywordsToSearch": ["COMPLETELY_NONEXISTENT_XYZ_99999"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 5
}
```

**Expected:**
- [ ] No error thrown
- [ ] Empty results with `totalMatches: 0`
- [ ] Clear indication no code found
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-13: Extension + Filename Combined

**Goal:** Verify `extension` and `filename` work together for precision.

```json
{
  "mainResearchGoal": "Find specific file types with specific names",
  "researchGoal": "Combined filters",
  "reasoning": "Multiple filters should narrow results further",
  "keywordsToSearch": ["export"],
  "extension": "ts",
  "filename": "index",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 10
}
```

**Expected:**
- [ ] Only `index.ts` files in results
- [ ] Highly targeted results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-14: Keywords Maximum (5 items, Boundary)

**Goal:** Verify `keywordsToSearch` with maximum 5 items works.

```json
{
  "mainResearchGoal": "Test keyword limit",
  "researchGoal": "Max 5 keywords",
  "reasoning": "5 keywords is the maximum allowed",
  "keywordsToSearch": ["export", "function", "async", "return", "Promise"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 5
}
```

**Expected:**
- [ ] Search succeeds with all 5 keywords combined
- [ ] Results contain all (or most) keywords
- [ ] No validation error
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status`
  - [ ] `data` object present with `text_matches` structure (fragment, object_url)
  - [ ] Status-specific hints array present
  - [ ] Hints suggest file reading and repo exploration

---

### TC-15: Limit Maximum (Boundary)

**Goal:** Verify `limit: 100` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test limit boundary",
  "researchGoal": "Maximum result limit",
  "reasoning": "Max limit should return many results",
  "keywordsToSearch": ["import"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 100
}
```

**Expected:**
- [ ] Up to 100 results returned
- [ ] No timeout or error
- [ ] Pagination shows total count
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-16: Page Maximum (Boundary)

**Goal:** Verify `page: 10` (maximum) works correctly.

```json
{
  "mainResearchGoal": "Test page boundary",
  "researchGoal": "Maximum page number",
  "reasoning": "Max page should return results or empty",
  "keywordsToSearch": ["export"],
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 5,
  "page": 10
}
```

**Expected:**
- [ ] Returns results from page 10 or empty if fewer pages exist
- [ ] No error thrown
- [ ] Pagination metadata accurate
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-17: Extension + Path Combined

**Goal:** Verify `extension` and `path` work together for precision.

```json
{
  "mainResearchGoal": "Find TypeScript files in specific directory",
  "researchGoal": "Combined extension + path filter",
  "reasoning": "Multiple filters should narrow results",
  "keywordsToSearch": ["export"],
  "extension": "ts",
  "path": "packages/octocode-mcp/src/security",
  "owner": "bgauryy",
  "repo": "octocode-mcp",
  "limit": 10
}
```

**Expected:**
- [ ] Only `.ts` files under `src/security/`
- [ ] Both filters applied simultaneously
- [ ] Highly targeted results
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-18: Empty Keywords Validation

**Goal:** Verify empty `keywordsToSearch` array is rejected.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Empty keywords",
  "reasoning": "Keywords array must have at least 1 item",
  "keywordsToSearch": [],
  "owner": "bgauryy",
  "repo": "octocode-mcp"
}
```

**Expected:**
- [ ] Validation error about minimum 1 keyword required
- [ ] Clear error message
- [ ] No search executed
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-19: Keywords Exceeds Maximum (Validation)

**Goal:** Verify more than 5 keywords is rejected.

```json
{
  "mainResearchGoal": "Test validation",
  "researchGoal": "Too many keywords",
  "reasoning": "Keywords max is 5",
  "keywordsToSearch": ["a", "b", "c", "d", "e", "f"],
  "owner": "bgauryy",
  "repo": "octocode-mcp"
}
```

**Expected:**
- [ ] Validation error about maximum 5 keywords
- [ ] Clear error message
- [ ] No search executed
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-20: Bulk Queries (Error Isolation)

**Goal:** Verify error isolation in bulk queries.

```json
{
  "queries": [
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid", "reasoning": "Test", "keywordsToSearch": ["export"], "owner": "bgauryy", "repo": "octocode-mcp", "limit": 3},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Invalid repo", "reasoning": "Test", "keywordsToSearch": ["test"], "owner": "bgauryy", "repo": "nonexistent-xyz-99999"},
    {"mainResearchGoal": "Bulk test", "researchGoal": "Valid 2", "reasoning": "Test", "keywordsToSearch": ["function"], "owner": "bgauryy", "repo": "octocode-mcp", "limit": 3}
  ]
}
```

**Expected:**
- [ ] First and third queries succeed
- [ ] Second query returns error (repo not found)
- [ ] Each result isolated per query
- [ ] No cascade failure
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query

---

### TC-21: Pagination Test

**Goal:** Verify `limit` and `page` parameters control result pagination.

```json
{
  "queries": [{
    "mainResearchGoal": "Test pagination functionality",
    "researchGoal": "Verify limit and page parameters work correctly",
    "reasoning": "Pagination is essential for managing large search result sets",
    "keywordsToSearch": ["function"],
    "match": "file",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "limit": 5,
    "page": 1
  }]
}
```

**Expected:**
- [ ] Max 5 results returned
- [ ] Page 1 results
- [ ] Pagination metadata in response
- [ ] **Response Validation:**
  - [ ] `instructions` field describes bulk response summary
  - [ ] `results` array contains per-query `status` (`hasResults` | `empty` | `error`)
  - [ ] `data` object present with tool-specific fields
  - [ ] Status-specific hints array present (e.g., `hasResultsStatusHints`)
  - [ ] Hints suggest actionable next steps relevant to the query
- [ ] **Hints Validation:**
  - [ ] Pagination navigation hints ("Next page: page: 2")
  - [ ] Total results insights
  - [ ] Search refinement suggestions if too many results

**Follow-up Test - Page 2:**
```json
{
  "queries": [{
    "mainResearchGoal": "Test pagination navigation",
    "researchGoal": "Verify page 2 returns different results",
    "reasoning": "Pagination should provide non-overlapping result sets",
    "keywordsToSearch": ["function"],
    "match": "file",
    "owner": "bgauryy",
    "repo": "octocode-mcp",
    "limit": 5,
    "page": 2
  }]
}
```

**Expected:**
- [ ] Different results than page 1
- [ ] No overlap with page 1 results
- [ ] Correct page indicators

---

## Validation Checklist

### Core Requirements
- [ ] **All test cases use queries structure** with `mainResearchGoal`, `researchGoal`, `reasoning` ✅ (Already implemented)
- [ ] **Pagination tests** verify `limit`, `page` parameters for result management
- [ ] **Hints validation** checks for helpful guidance in all responses

### Test Cases Status

| # | Test Case | Queries | Pagination | Hints | Status |
|---|-----------|---------|------------|-------|--------|
| 1 | Path match mode | ✅ | - | ✅ | |
| 2 | File match mode | ✅ | - | ✅ | |
| 3 | Extension filter | ✅ | - | ✅ | |
| 4 | Filename filter | ✅ | - | ✅ | |
| 5 | Multi-keyword | ✅ | - | ✅ | |
| 6 | Path prefix filter | ✅ | - | ✅ | |
| 7 | Limit results | ✅ | ✅ | ✅ | |
| 8 | Pagination totalMatches | ✅ | ✅ | ✅ | |
| 9 | Cross-repo search | ✅ | - | ✅ | |
| 10 | Page navigation | ✅ | ✅ | ✅ | |
| 11 | Non-existent repo (error) | ✅ | - | ✅ | |
| 12 | Empty results | ✅ | - | ✅ | |
| 13 | Extension + filename combined | ✅ | - | ✅ | |
| 14 | Keywords maximum (5 items) | ✅ | - | ✅ | |
| 15 | Limit maximum (100) | ✅ | ✅ | ✅ | |
| 16 | Page maximum (10) | ✅ | ✅ | ✅ | |
| 17 | Extension + path combined | ✅ | - | ✅ | |
| 21 | Pagination test | ✅ | ✅ | ✅ | |
| 18 | Empty keywords validation | ✅ | - | ✅ | |
| 19 | Keywords exceeds maximum | ✅ | - | ✅ | |
| 20 | Bulk queries (error isolation) | ✅ | - | ✅ | |
